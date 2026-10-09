import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";

/** Audit actions. Keep values stable — they are stored in the database. */
export const ACTIONS = {
  LOGIN: "auth.login",
  LOGIN_FAILED: "auth.login_failed",
  LOGOUT: "auth.logout",
  PASSWORD_CHANGED: "auth.password_changed",
  OWNER_SETUP: "auth.owner_setup",

  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_PASSWORD_RESET: "user.password_reset",

  ROOM_CREATED: "room.created",
  ROOM_UPDATED: "room.updated",
  ROOM_DELETED: "room.deleted",
  BED_CREATED: "bed.created",
  BED_UPDATED: "bed.updated",
  BED_DELETED: "bed.deleted",

  STUDENT_CREATED: "student.created",
  STUDENT_UPDATED: "student.updated",
  STUDENT_CHECKED_IN: "student.checked_in",
  STUDENT_CHECKED_OUT: "student.checked_out",
  STUDENT_BED_CHANGED: "student.bed_changed",
  STUDENT_STATUS_CHANGED: "student.status_changed",
  BED_ASSIGNED: "bed.assigned",

  RENT_GENERATED: "rent.generated",
  RENT_EDITED: "rent.edited",
  RENT_VOIDED: "rent.voided",
  PAYMENT_RECORDED: "payment.recorded",
  PAYMENT_EDITED: "payment.edited",
  PAYMENT_VOIDED: "payment.voided",
  REMINDER_RULE_UPDATED: "reminder_rule.updated",
  REMINDERS_RUN: "reminders.run",

  OVERNIGHT_UPDATED: "overnight.updated",
  MEAL_CREATED: "meal.created",
  MEAL_UPDATED: "meal.updated",
  MEAL_DELETED: "meal.deleted",
  MEAL_RECORDED: "meal.recorded",

  STOCK_ITEM_CREATED: "stock.item_created",
  STOCK_ITEM_UPDATED: "stock.item_updated",
  STOCK_ADJUSTED: "stock.adjusted",
  PURCHASE_RECORDED: "purchase.recorded",
  PURCHASE_VOIDED: "purchase.voided",
  EXPENSE_RECORDED: "expense.recorded",
  EXPENSE_VOIDED: "expense.voided",
  SHOPPING_REQUEST_CREATED: "shopping_request.created",
  SHOPPING_REQUEST_APPROVED: "shopping_request.approved",
  SHOPPING_REQUEST_REJECTED: "shopping_request.rejected",
  SHOPPING_REQUEST_PURCHASED: "shopping_request.purchased",
  SHOPPING_REQUEST_CANCELLED: "shopping_request.cancelled",

  ANNOUNCEMENT_CREATED: "announcement.created",
  ANNOUNCEMENT_UPDATED: "announcement.updated",
  ANNOUNCEMENT_DELETED: "announcement.deleted",
  SETTINGS_UPDATED: "settings.updated",
} as const;

export type ActivityAction = (typeof ACTIONS)[keyof typeof ACTIONS];

export async function logActivity(
  client: Tx | typeof db,
  entry: {
    userId: string | null;
    action: ActivityAction;
    entityType: string;
    entityId?: string | null;
    details?: Prisma.InputJsonValue;
    ipAddress?: string | null;
  },
): Promise<void> {
  await client.activityLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      details: entry.details,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}
