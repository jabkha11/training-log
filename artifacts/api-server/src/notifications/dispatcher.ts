import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { pushSubscriptionsTable, restTimerJobsTable } from "@workspace/db/schema";
import { logger } from "../lib/logger";
import { isWebPushConfigured, webpush } from "../lib/webPush";

const POLL_INTERVAL_MS = 15_000;
const BATCH_SIZE = 25;

let intervalHandle: NodeJS.Timeout | null = null;
let isPolling = false;

function buildPayload(job: typeof restTimerJobsTable.$inferSelect) {
  return JSON.stringify({
    title: job.title,
    body: job.body,
    tag: `rest-timer-${job.timerId}`,
    data: {
      route: job.route,
      dayId: job.dayId,
      timerId: job.timerId,
    },
  });
}

async function markJobStatus(
  timerId: string,
  status: "sent" | "failed" | "canceled",
  errorMessage?: string,
) {
  await db
    .update(restTimerJobsTable)
    .set({
      status,
      errorMessage: errorMessage ?? null,
      sentAt: status === "sent" ? new Date() : null,
      canceledAt: status === "canceled" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(restTimerJobsTable.timerId, timerId));
}

async function claimJob(timerId: string) {
  const [claimedJob] = await db
    .update(restTimerJobsTable)
    .set({
      status: "processing",
      lastAttemptAt: new Date(),
      attemptCount: sql`${restTimerJobsTable.attemptCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(restTimerJobsTable.timerId, timerId),
        eq(restTimerJobsTable.status, "pending"),
      ),
    )
    .returning();

  return claimedJob ?? null;
}

async function dispatchJob(job: typeof restTimerJobsTable.$inferSelect) {
  const claimedJob = await claimJob(job.timerId);
  if (!claimedJob) return;

  const subscriptions = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.installId, claimedJob.installId),
        eq(pushSubscriptionsTable.active, true),
      ),
    );

  if (subscriptions.length === 0) {
    await markJobStatus(claimedJob.timerId, "failed", "No active subscriptions for install");
    return;
  }

  const payload = buildPayload(claimedJob);
  let delivered = false;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime?.getTime() ?? null,
          keys: {
            p256dh: subscription.publicKey,
            auth: subscription.authSecret,
          },
        },
        payload,
      );
      delivered = true;
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : null;

      if (statusCode === 404 || statusCode === 410) {
        await db
          .update(pushSubscriptionsTable)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(pushSubscriptionsTable.id, subscription.id));
      }

      logger.warn(
        {
          err: error,
          timerId: claimedJob.timerId,
          endpoint: subscription.endpoint,
          statusCode,
        },
        "Failed to send rest timer push notification",
      );
    }
  }

  if (delivered) {
    await markJobStatus(claimedJob.timerId, "sent");
    return;
  }

  await markJobStatus(claimedJob.timerId, "failed", "All push deliveries failed");
}

async function processDueJobs() {
  if (isPolling || !isWebPushConfigured()) return;
  isPolling = true;

  try {
    const dueJobs = await db
      .select()
      .from(restTimerJobsTable)
      .where(
        and(
          eq(restTimerJobsTable.status, "pending"),
          lte(restTimerJobsTable.scheduledFor, new Date()),
        ),
      )
      .orderBy(asc(restTimerJobsTable.scheduledFor))
      .limit(BATCH_SIZE);

    for (const job of dueJobs) {
      await dispatchJob(job);
    }
  } catch (error) {
    logger.error({ err: error }, "Rest timer dispatcher failed");
  } finally {
    isPolling = false;
  }
}

export function startNotificationDispatcher() {
  if (!isWebPushConfigured()) {
    logger.warn("Web push is not configured; rest timer notifications are disabled");
    return;
  }

  if (intervalHandle) return;

  void processDueJobs();
  intervalHandle = setInterval(() => {
    void processDueJobs();
  }, POLL_INTERVAL_MS);
}
