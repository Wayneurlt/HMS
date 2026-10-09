"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { defineAction } from "@/lib/action";
import { ActionError } from "@/lib/auth/guards";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import { isResidentOn, nightSummaries } from "@/lib/services/attendance";
import { addDays, diffDays, formatDate, toISODate } from "@/lib/dates";
import { zDate, zId, zOptDate, zOptText } from "@/lib/validation/common";

const MAX_BULK_NIGHTS = 60;

function revalidateOvernight() {
  for (const p of ["/overnight", "/meals", "/kitchen", "/kitchen/today", "/dashboard", "/me", "/me/overnight"]) {
    revalidatePath(p);
  }
}

const setSchema = z.object({
  studentId: zId(),
  date: zDate("Night"),
  status: z.enum(["STAYING", "AWAY", "CLEAR"], { error: "Choose an answer" }),
  expectedReturnDate: zOptDate("Expected return date"),
  note: zOptText(300),
});

/** Set (or clear) one student's answer for one night, on their behalf. */
export const setOvernightStatus = defineAction(
  { permission: "overnight.manage", schema: setSchema, rateLimit: { key: "overnight-set", limit: 120, windowMs: 60_000 } },
  async (input, user) => {
    const student = await db.student.findUnique({ where: { id: input.studentId }, select: { fullName: true, deletedAt: true } });
    if (!student || student.deletedAt) throw new ActionError("Student not found.");
    if (!(await isResidentOn(input.studentId, input.date))) {
      throw new ActionError(`${student.fullName} is not a resident on the night of ${formatDate(input.date)}.`);
    }

    if (input.status === "CLEAR") {
      await db.$transaction(async (tx) => {
        await tx.overnightStatus.deleteMany({ where: { studentId: input.studentId, date: input.date } });
        await logActivity(tx, {
          userId: user.id,
          action: ACTIONS.OVERNIGHT_UPDATED,
          entityType: "Student",
          entityId: input.studentId,
          details: { date: toISODate(input.date), status: "CLEARED" },
        });
      });
      revalidateOvernight();
      return { message: `Cleared ${student.fullName}'s answer for ${formatDate(input.date)}` };
    }

    const away = input.status === "AWAY";
    const expectedReturnDate = away ? input.expectedReturnDate : null;
    if (expectedReturnDate && expectedReturnDate.getTime() <= input.date.getTime()) {
      throw new ActionError("Expected return must be after the night they are away.", {
        expectedReturnDate: ["Must be after the selected night"],
      });
    }
    const data = { status: input.status, expectedReturnDate, note: input.note, updatedById: user.id };
    await db.$transaction(async (tx) => {
      await tx.overnightStatus.upsert({
        where: { studentId_date: { studentId: input.studentId, date: input.date } },
        create: { studentId: input.studentId, date: input.date, ...data },
        update: data,
      });
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.OVERNIGHT_UPDATED,
        entityType: "Student",
        entityId: input.studentId,
        details: {
          date: toISODate(input.date),
          status: input.status,
          expectedReturnDate: expectedReturnDate ? toISODate(expectedReturnDate) : null,
        },
      });
    });
    revalidateOvernight();
    return { message: `${student.fullName} marked ${away ? "away" : "staying"} for ${formatDate(input.date)}` };
  },
);

const bulkSchema = z
  .object({
    studentId: zId(),
    from: zDate("From"),
    to: zDate("To"),
    status: z.enum(["STAYING", "AWAY"], { error: "Choose an answer" }),
    expectedReturnDate: zOptDate("Expected return date"),
    note: zOptText(300),
  })
  .superRefine((v, ctx) => {
    const nights = diffDays(v.from, v.to) + 1;
    if (nights < 1) ctx.addIssue({ code: "custom", path: ["to"], message: "Must be on or after the start date" });
    else if (nights > MAX_BULK_NIGHTS) {
      ctx.addIssue({ code: "custom", path: ["to"], message: `At most ${MAX_BULK_NIGHTS} nights at a time` });
    }
    if (v.status === "AWAY" && v.expectedReturnDate && v.expectedReturnDate.getTime() <= v.from.getTime()) {
      ctx.addIssue({ code: "custom", path: ["expectedReturnDate"], message: "Must be after the first night away" });
    }
  });

/** Set a student AWAY/STAYING for every night in a range on which they are a resident. */
export const bulkSetOvernight = defineAction(
  { permission: "overnight.manage", schema: bulkSchema },
  async (input, user) => {
    const student = await db.student.findUnique({ where: { id: input.studentId }, select: { fullName: true, deletedAt: true } });
    if (!student || student.deletedAt) throw new ActionError("Student not found.");
    const away = input.status === "AWAY";
    // Default return day for an away stretch: the morning after the last night.
    const expectedReturnDate = away ? (input.expectedReturnDate ?? addDays(input.to, 1)) : null;

    const count = await db.$transaction(
      async (tx) => {
        const nights = (await nightSummaries(input.from, input.to, tx))
          .filter((n) => n.students.some((s) => s.studentId === input.studentId))
          .map((n) => n.date);
        if (nights.length === 0) {
          throw new ActionError(`${student.fullName} is not a resident on any night in that range.`);
        }
        await tx.overnightStatus.deleteMany({ where: { studentId: input.studentId, date: { in: nights } } });
        await tx.overnightStatus.createMany({
          data: nights.map((date) => ({
            studentId: input.studentId,
            date,
            status: input.status,
            expectedReturnDate,
            note: input.note,
            updatedById: user.id,
          })),
        });
        await logActivity(tx, {
          userId: user.id,
          action: ACTIONS.OVERNIGHT_UPDATED,
          entityType: "Student",
          entityId: input.studentId,
          details: {
            bulk: true,
            from: toISODate(input.from),
            to: toISODate(input.to),
            nights: nights.length,
            status: input.status,
            expectedReturnDate: expectedReturnDate ? toISODate(expectedReturnDate) : null,
          },
        });
        return nights.length;
      },
      { timeout: 20_000 },
    );
    revalidateOvernight();
    return {
      message: `${student.fullName} marked ${away ? "away" : "staying"} for ${count} night${count === 1 ? "" : "s"}`,
    };
  },
);
