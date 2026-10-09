"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { defineAction } from "@/lib/action";
import { ActionError } from "@/lib/auth/guards";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import { mealExpectation } from "@/lib/services/attendance";
import { formatDayShort, toISODate, today } from "@/lib/dates";
import { round2 } from "@/lib/format";
import { zCheckbox, zId, zOptText } from "@/lib/validation/common";

const blankToNull = (v: unknown) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v);

const recordSchema = z.object({
  mealId: zId(),
  servedCount: z.preprocess(
    blankToNull,
    z.coerce
      .number({ error: "Enter a number" })
      .int("Must be a whole number")
      .min(0, "Cannot be negative")
      .max(5000, "That number is too large")
      .nullable(),
  ),
  leftoverPortions: z.preprocess(
    (v) => blankToNull(v) ?? 0,
    z.coerce
      .number({ error: "Enter a number" })
      .refine((n) => Number.isFinite(n), "Enter a valid number")
      .refine((n) => n >= 0, "Cannot be negative")
      .refine((n) => n <= 100_000, "That number is too large")
      .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "At most 2 decimal places"),
  ),
  notes: zOptText(500),
  trackAttendance: zCheckbox(),
  listed: z.array(zId()).max(1000).default([]),
  present: z.array(zId()).max(1000).default([]),
});

/** Save (or update) the kitchen's numbers for a meal, with optional per-student attendance. */
export const recordMeal = defineAction({ permission: "meals.record", schema: recordSchema }, async (input, user) => {
  const meal = await db.meal.findUnique({
    where: { id: input.mealId },
    include: { attendances: { select: { studentId: true } } },
  });
  if (!meal) throw new ActionError("Meal not found. Ask the manager to add it to the timetable.");
  if (meal.date.getTime() > today().getTime()) {
    throw new ActionError("You can't record a meal that hasn't happened yet.");
  }
  const listed = input.trackAttendance ? [...new Set(input.listed)] : [];
  const present = input.trackAttendance ? new Set(input.present) : new Set<string>();
  if (input.trackAttendance && listed.length === 0) {
    throw new ActionError("There are no students in the attendance list. Untick attendance tracking or enter the served count.");
  }
  if ([...present].some((id) => !listed.includes(id))) throw new ActionError("Attendance list is out of date. Reload and try again.");
  if (input.servedCount === null && !input.trackAttendance) {
    throw new ActionError("Enter how many were served.", { servedCount: ["Served count is required"] });
  }
  const served = input.servedCount ?? present.size;
  const leftovers = round2(input.leftoverPortions);
  const label = meal.type === "BREAKFAST" ? "Breakfast" : "Dinner";

  await db.$transaction(
    async (tx) => {
      const exp = await mealExpectation(meal.date, meal.type, tx);
      const known = new Set([
        ...exp.expectedStudents.map((s) => s.studentId),
        ...exp.awayStudents.map((s) => s.studentId),
        ...meal.attendances.map((a) => a.studentId),
      ]);
      if (listed.some((id) => !known.has(id))) {
        throw new ActionError("The attendance list includes a student who isn't a resident for this meal. Reload and try again.");
      }
      const data = {
        expectedCount: exp.expected,
        servedCount: served,
        leftoverPortions: leftovers,
        notes: input.notes,
        recordedById: user.id,
      };
      const record = await tx.mealRecord.upsert({
        where: { mealId: meal.id },
        create: { mealId: meal.id, ...data },
        update: data,
      });
      for (const studentId of listed) {
        const attended = present.has(studentId);
        await tx.mealAttendance.upsert({
          where: { mealId_studentId: { mealId: meal.id, studentId } },
          create: { mealId: meal.id, studentId, attended },
          update: { attended },
        });
      }
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.MEAL_RECORDED,
        entityType: "MealRecord",
        entityId: record.id,
        details: {
          mealId: meal.id,
          date: toISODate(meal.date),
          type: meal.type,
          expected: exp.expected,
          served,
          leftovers,
          attendance: input.trackAttendance ? { listed: listed.length, attended: present.size } : null,
        },
      });
    },
    { timeout: 20_000 },
  );

  for (const p of ["/kitchen", "/kitchen/today", "/kitchen/records", "/meals", "/dashboard"]) revalidatePath(p);
  return { message: `${label} for ${formatDayShort(meal.date)} recorded — ${served} served` };
});
