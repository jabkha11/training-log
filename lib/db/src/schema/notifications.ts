import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const restTimerJobStatusEnum = pgEnum("rest_timer_job_status", [
  "pending",
  "processing",
  "sent",
  "canceled",
  "failed",
]);

export const pushSubscriptionsTable = pgTable(
  "push_subscriptions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    installId: text("install_id").notNull(),
    endpoint: text("endpoint").notNull(),
    publicKey: text("public_key").notNull(),
    authSecret: text("auth_secret").notNull(),
    expirationTime: timestamp("expiration_time", { withTimezone: true }),
    userAgent: text("user_agent"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    endpointUniqueIdx: uniqueIndex("push_subscriptions_endpoint_unique_idx").on(table.endpoint),
  }),
);

export const restTimerJobsTable = pgTable(
  "rest_timer_jobs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    timerId: text("timer_id").notNull(),
    installId: text("install_id").notNull(),
    dayId: text("day_id").notNull(),
    route: text("route").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: restTimerJobStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    timerUniqueIdx: uniqueIndex("rest_timer_jobs_timer_unique_idx").on(table.timerId),
  }),
);

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRestTimerJobSchema = createInsertSchema(restTimerJobsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  attemptCount: true,
  lastAttemptAt: true,
  sentAt: true,
  canceledAt: true,
  errorMessage: true,
});

export type InsertPushSubscription = typeof pushSubscriptionsTable.$inferInsert;
export type PushSubscriptionRecord = typeof pushSubscriptionsTable.$inferSelect;

export type InsertRestTimerJob = typeof restTimerJobsTable.$inferInsert;
export type RestTimerJobRecord = typeof restTimerJobsTable.$inferSelect;
