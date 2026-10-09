"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { defineAction } from "@/lib/action";
import { ActionError } from "@/lib/auth/guards";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import { notifyRoles } from "@/lib/services/notifications";
import { zId, zOptDate, zText } from "@/lib/validation/common";
import { addDays } from "@/lib/dates";

const announcementSchema = z.object({
  title: zText(120, "Title"),
  message: zText(4000, "Message"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  audience: z.enum(["ALL", "STUDENTS", "STAFF"]),
  expiresOn: zOptDate("Expiry date"),
});

function audienceRoles(audience: "ALL" | "STUDENTS" | "STAFF"): Role[] {
  if (audience === "STUDENTS") return ["STUDENT"];
  if (audience === "STAFF") return ["OWNER", "HOSTEL_MANAGER", "KITCHEN_STAFF"];
  return ["OWNER", "HOSTEL_MANAGER", "KITCHEN_STAFF", "STUDENT"];
}

/** Expiry date is inclusive: the announcement is visible through the end of that day. */
const expiryFrom = (d: Date | null) => (d ? addDays(d, 1) : null);

export const createAnnouncement = defineAction(
  { permission: "announcements.manage", schema: announcementSchema },
  async (input, user) => {
    const expiresAt = expiryFrom(input.expiresOn);
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new ActionError("Expiry date must be today or later.", { expiresOn: ["Must be today or later"] });
    }
    const a = await db.$transaction(async (tx) => {
      const a = await tx.announcement.create({
        data: {
          title: input.title,
          message: input.message,
          priority: input.priority,
          audience: input.audience,
          expiresAt,
          createdById: user.id,
        },
      });
      await notifyRoles(tx, audienceRoles(input.audience), {
        type: "ANNOUNCEMENT",
        title: input.title,
        message: input.message.slice(0, 300),
        link: "/me/announcements",
        dedupeKey: `announcement:${a.id}`,
      });
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.ANNOUNCEMENT_CREATED,
        entityType: "Announcement",
        entityId: a.id,
        details: { title: a.title, priority: a.priority, audience: a.audience },
      });
      return a;
    });
    revalidatePath("/announcements");
    return { message: `Announcement "${a.title}" published` };
  },
);

export const updateAnnouncement = defineAction(
  { permission: "announcements.manage", schema: announcementSchema.extend({ id: zId() }) },
  async (input, user) => {
    const existing = await db.announcement.findUnique({ where: { id: input.id } });
    if (!existing || existing.deletedAt) throw new ActionError("Announcement not found.");
    await db.announcement.update({
      where: { id: input.id },
      data: {
        title: input.title,
        message: input.message,
        priority: input.priority,
        audience: input.audience,
        expiresAt: expiryFrom(input.expiresOn),
      },
    });
    await logActivity(db, {
      userId: user.id,
      action: ACTIONS.ANNOUNCEMENT_UPDATED,
      entityType: "Announcement",
      entityId: input.id,
      details: { title: input.title },
    });
    revalidatePath("/announcements");
    return { message: "Announcement updated" };
  },
);

export const deleteAnnouncement = defineAction(
  { permission: "announcements.manage", schema: z.object({ id: zId() }) },
  async (input, user) => {
    const existing = await db.announcement.findUnique({ where: { id: input.id } });
    if (!existing || existing.deletedAt) throw new ActionError("Announcement not found.");
    // Soft delete keeps the history.
    await db.announcement.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
    await logActivity(db, {
      userId: user.id,
      action: ACTIONS.ANNOUNCEMENT_DELETED,
      entityType: "Announcement",
      entityId: input.id,
      details: { title: existing.title },
    });
    revalidatePath("/announcements");
    return { message: "Announcement removed" };
  },
);
