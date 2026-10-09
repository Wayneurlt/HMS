"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { defineAction } from "@/lib/action";
import { ActionError } from "@/lib/auth/guards";
import { zId } from "@/lib/validation/common";

/** Mark one notification read. Ownership is enforced by scoping the update to the session user. */
export const markNotificationRead = defineAction(
  { permission: "notifications.view", schema: z.object({ id: zId() }) },
  async (input, user) => {
    const res = await db.notification.updateMany({
      where: { id: input.id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (res.count === 0) {
      const exists = await db.notification.count({ where: { id: input.id, userId: user.id } });
      if (!exists) throw new ActionError("Notification not found.");
    }
    revalidatePath("/notifications");
    return { message: "Marked as read" };
  },
);

export const markAllNotificationsRead = defineAction(
  { permission: "notifications.view", schema: z.object({}) },
  async (_input, user) => {
    const res = await db.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/notifications");
    return { message: res.count ? `${res.count} notification${res.count === 1 ? "" : "s"} marked as read` : "Nothing to mark" };
  },
);
