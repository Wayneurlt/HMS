"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { defineAction } from "@/lib/action";
import { ActionError } from "@/lib/auth/guards";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import { addDays, formatDate, formatDayShort, toISODate } from "@/lib/dates";
import { zDate, zId, zOptText, zText } from "@/lib/validation/common";
import { MEAL_LABEL, isMealServedOn } from "@/lib/meals";

function revalidateMeals() {
  for (const p of ["/meals", "/kitchen", "/kitchen/today", "/kitchen/records", "/dashboard", "/me", "/me/meals"]) {
    revalidatePath(p);
  }
}

const mealLabel = (type: keyof typeof MEAL_LABEL) => MEAL_LABEL[type];

/** Monday of the week containing d (date-only). */
function weekStart(d: Date): Date {
  return addDays(d, -((d.getUTCDay() + 6) % 7));
}

const mealSchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), zId().optional()),
  date: zDate("Date"),
  type: z.enum(["BREAKFAST", "LUNCH", "DINNER"], { error: "Choose breakfast, lunch or dinner" }),
  menu: zText(500, "Menu"),
  notes: zOptText(500),
}).refine((v) => isMealServedOn(v.type, v.date), {
  path: ["type"],
  message: "Lunch is only served on Saturdays and Sundays",
});

/** Create a meal, or update it when `id` is given. (date, type) is unique. */
export const saveMeal = defineAction({ permission: "meals.manage", schema: mealSchema }, async (input, user) => {
  const clash = await db.meal.findUnique({ where: { date_type: { date: input.date, type: input.type } }, select: { id: true } });
  if (clash && clash.id !== input.id) {
    throw new ActionError(`${mealLabel(input.type)} on ${formatDayShort(input.date)} already exists — edit that meal instead.`, {
      date: ["A meal of this type already exists on this day"],
    });
  }

  try {
    if (input.id) {
      const existing = await db.meal.findUnique({ where: { id: input.id }, include: { record: { select: { id: true } } } });
      if (!existing) throw new ActionError("Meal not found.");
      const moved = existing.date.getTime() !== input.date.getTime() || existing.type !== input.type;
      if (moved && existing.record) {
        throw new ActionError("This meal has already been recorded by the kitchen, so its date and type can't change.");
      }
      await db.$transaction(async (tx) => {
        await tx.meal.update({
          where: { id: input.id },
          data: { date: input.date, type: input.type, menu: input.menu, notes: input.notes },
        });
        await logActivity(tx, {
          userId: user.id,
          action: ACTIONS.MEAL_UPDATED,
          entityType: "Meal",
          entityId: input.id!,
          details: { date: toISODate(input.date), type: input.type, menu: input.menu },
        });
      });
      revalidateMeals();
      return { message: `${mealLabel(input.type)} for ${formatDayShort(input.date)} updated` };
    }

    await db.$transaction(async (tx) => {
      const meal = await tx.meal.create({
        data: { date: input.date, type: input.type, menu: input.menu, notes: input.notes, createdById: user.id },
      });
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.MEAL_CREATED,
        entityType: "Meal",
        entityId: meal.id,
        details: { date: toISODate(input.date), type: input.type, menu: input.menu },
      });
    });
    revalidateMeals();
    return { message: `${mealLabel(input.type)} for ${formatDayShort(input.date)} added` };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ActionError(`${mealLabel(input.type)} on ${formatDayShort(input.date)} already exists.`);
    }
    throw e;
  }
});

/** Hard delete — only for meals the kitchen hasn't recorded (no record, no attendance). */
export const deleteMeal = defineAction({ permission: "meals.manage", schema: z.object({ id: zId() }) }, async (input, user) => {
  const meal = await db.meal.findUnique({
    where: { id: input.id },
    include: { record: { select: { id: true } }, _count: { select: { attendances: true } } },
  });
  if (!meal) throw new ActionError("Meal not found.");
  if (meal.record || meal._count.attendances > 0) {
    throw new ActionError("This meal has been recorded by the kitchen and can't be deleted. Edit the menu instead.");
  }
  await db.$transaction(async (tx) => {
    await tx.meal.delete({ where: { id: meal.id } });
    await logActivity(tx, {
      userId: user.id,
      action: ACTIONS.MEAL_DELETED,
      entityType: "Meal",
      entityId: meal.id,
      details: { date: toISODate(meal.date), type: meal.type, menu: meal.menu },
    });
  });
  revalidateMeals();
  return { message: `${mealLabel(meal.type)} for ${formatDayShort(meal.date)} removed` };
});

/** Fill the missing meals of a week from the week before. Existing meals are left untouched. */
export const copyPreviousWeek = defineAction(
  { permission: "meals.manage", schema: z.object({ week: zDate("Week") }) },
  async (input, user) => {
    const start = weekStart(input.week);
    const end = addDays(start, 6);
    const [previous, current] = await Promise.all([
      db.meal.findMany({ where: { date: { gte: addDays(start, -7), lte: addDays(end, -7) } } }),
      db.meal.findMany({ where: { date: { gte: start, lte: end } }, select: { date: true, type: true } }),
    ]);
    if (previous.length === 0) throw new ActionError("The previous week has no meals to copy.");
    const taken = new Set(current.map((m) => `${toISODate(m.date)}|${m.type}`));
    const toCreate = previous
      .map((m) => ({ date: addDays(m.date, 7), type: m.type, menu: m.menu, notes: m.notes, createdById: user.id }))
      .filter((m) => !taken.has(`${toISODate(m.date)}|${m.type}`));
    if (toCreate.length === 0) throw new ActionError("Every meal copied from last week is already set for this week.");

    await db.$transaction(async (tx) => {
      await tx.meal.createMany({ data: toCreate, skipDuplicates: true });
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.MEAL_CREATED,
        entityType: "Meal",
        details: { copiedFromWeek: toISODate(addDays(start, -7)), week: toISODate(start), count: toCreate.length },
      });
    });
    revalidateMeals();
    return {
      message: `Copied ${toCreate.length} meal${toCreate.length === 1 ? "" : "s"} into the week of ${formatDate(start)}`,
    };
  },
);
