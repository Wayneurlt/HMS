"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { defineAction } from "@/lib/action";
import { toNumber } from "@/lib/format";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import { getSettings } from "@/lib/services/settings";
import { zCheckbox, zEmail, zInt, zMoney, zOptText, zPhone, zText } from "@/lib/validation/common";

const zTime = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} must be a time like 07:00`);

const settingsSchema = z.object({
  hostelName: zText(100, "Hostel name"),
  address: zOptText(300),
  phone: zPhone(false),
  email: zEmail(false),
  defaultMonthlyRent: zMoney({ label: "Default monthly rent", max: 1_000_000 }),
  defaultRentDueDay: zInt(1, 28, "Rent due day"),
  prorateFirstMonth: zCheckbox(),
  breakfastTime: zTime("Breakfast time"),
  dinnerTime: zTime("Dinner time"),
});

export const updateSettings = defineAction(
  { permission: "settings.manage", schema: settingsSchema },
  async (input, user) => {
    await db.$transaction(async (tx) => {
      const before = await getSettings(tx);
      const prev: Record<string, unknown> = {
        hostelName: before.hostelName,
        address: before.address,
        phone: before.phone,
        email: before.email,
        defaultMonthlyRent: toNumber(before.defaultMonthlyRent),
        defaultRentDueDay: before.defaultRentDueDay,
        prorateFirstMonth: before.prorateFirstMonth,
        breakfastTime: before.breakfastTime,
        dinnerTime: before.dinnerTime,
      };
      const next: Record<string, unknown> = { ...input };
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(prev)) {
        if (prev[key] !== next[key]) changes[key] = { from: prev[key] ?? null, to: next[key] ?? null };
      }
      await tx.hostelSettings.update({ where: { id: 1 }, data: input });
      if (Object.keys(changes).length) {
        await logActivity(tx, {
          userId: user.id,
          action: ACTIONS.SETTINGS_UPDATED,
          entityType: "HostelSettings",
          entityId: "1",
          details: JSON.parse(JSON.stringify({ changes })),
        });
      }
    });
    revalidatePath("/", "layout");
    return { message: "Settings saved" };
  },
);
