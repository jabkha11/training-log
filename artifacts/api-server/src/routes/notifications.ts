import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  UpsertNotificationSubscriptionBody,
  UpsertNotificationSubscriptionResponse,
  CancelRestTimerNotificationResponse,
  ScheduleRestTimerNotificationBody,
  ScheduleRestTimerNotificationResponse,
} from "@workspace/api-zod/generated/api";
import { db } from "@workspace/db";
import { pushSubscriptionsTable, restTimerJobsTable } from "@workspace/db/schema";
import { isWebPushConfigured } from "../lib/webPush";

const router: IRouter = Router();

router.post("/notifications/subscriptions", async (req, res) => {
  if (!isWebPushConfigured()) {
    res.status(503).json({ message: "Web push is not configured on the server." });
    return;
  }

  const payload = UpsertNotificationSubscriptionBody.parse(req.body);

  await db
    .insert(pushSubscriptionsTable)
    .values({
      installId: payload.installId,
      endpoint: payload.subscription.endpoint,
      publicKey: payload.subscription.keys.p256dh,
      authSecret: payload.subscription.keys.auth,
      expirationTime: payload.subscription.expirationTime
        ? new Date(payload.subscription.expirationTime)
        : null,
      userAgent: req.get("user-agent") ?? null,
      active: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: {
        installId: payload.installId,
        publicKey: payload.subscription.keys.p256dh,
        authSecret: payload.subscription.keys.auth,
        expirationTime: payload.subscription.expirationTime
          ? new Date(payload.subscription.expirationTime)
          : null,
        userAgent: req.get("user-agent") ?? null,
        active: true,
        updatedAt: new Date(),
      },
    });

  res.json(
    UpsertNotificationSubscriptionResponse.parse({
      status: "ok",
      installId: payload.installId,
    }),
  );
});

router.post("/notifications/rest-timers", async (req, res) => {
  if (!isWebPushConfigured()) {
    res.status(503).json({ message: "Web push is not configured on the server." });
    return;
  }

  const payload = ScheduleRestTimerNotificationBody.parse({
    ...req.body,
    scheduledFor: req.body?.scheduledFor ? new Date(String(req.body.scheduledFor)) : req.body?.scheduledFor,
  });

  await db
    .insert(restTimerJobsTable)
    .values({
      timerId: payload.timerId,
      installId: payload.installId,
      dayId: payload.dayId,
      route: payload.route,
      title: payload.title,
      body: payload.body,
      durationSeconds: payload.durationSeconds,
      scheduledFor: payload.scheduledFor,
      status: "pending",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: restTimerJobsTable.timerId,
      set: {
        installId: payload.installId,
        dayId: payload.dayId,
        route: payload.route,
        title: payload.title,
        body: payload.body,
        durationSeconds: payload.durationSeconds,
        scheduledFor: payload.scheduledFor,
        status: "pending",
        errorMessage: null,
        canceledAt: null,
        sentAt: null,
        updatedAt: new Date(),
      },
    });

  res.json(
    ScheduleRestTimerNotificationResponse.parse({
      status: "scheduled",
      timerId: payload.timerId,
      scheduledFor: payload.scheduledFor,
    }),
  );
});

router.delete("/notifications/rest-timers/:timerId", async (req, res) => {
  const timerId = req.params["timerId"];
  const installId = req.query["installId"];

  if (typeof timerId !== "string" || typeof installId !== "string") {
    res.status(400).json({ message: "timerId path param and installId query param are required." });
    return;
  }

  await db
    .update(restTimerJobsTable)
    .set({
      status: "canceled",
      canceledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(restTimerJobsTable.timerId, timerId),
        eq(restTimerJobsTable.installId, installId),
      ),
    );

  res.json(
    CancelRestTimerNotificationResponse.parse({
      status: "canceled",
      timerId,
    }),
  );
});

export default router;
