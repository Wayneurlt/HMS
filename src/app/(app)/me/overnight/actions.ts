"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { defineAction } from "@/lib/action";
import { ActionError } from "@/lib/auth/guards";
import type { SessionUser } from "@/lib/auth/session";
import { addDays, diffDays, formatDate, toISODate, today } from "@/lib/dates";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import { isResidentOn } from "@/lib/services/attendance";
import { zDate, zOptDate, zOptText } from "@/lib/validation/common";

/**
 * Student self-service overnight answers.
 * SECURITY: the student is ALWAYS derived from the session (user.studentId) — never from input.
 */

const RATE = { key: "overnight", limit: 60, windowMs: 60_000 };
const MAX_RANGE_NIGHTS = 60;
/** How far ahead a student may plan (keeps junk data out). */
const MAX_DAYS_AHEAD = 180;

const zState = z.enum(["STAYING", "AWAY"], { error: "Choose Staying or Away" });

async function selfStudent(user: SessionUser): Promise<string> {
  if (!user.studentId) throw new ActionError("Your account is not linked to a student record.");
  const s = await db.student.findUnique({
    where: { id: user.studentId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!s || s.deletedAt) throw new ActionError("Your student record was not found.");
  if (s.status !== "ACTIVE" && s.status !== "SUSPENDED") {
    throw new ActionError("Only current residents can update their overnight status. Please contact the hostel office.");
  }
  return s.id;
}

function assertNotPast(date: Date, field: string) {
  const t = today();
  if (date.getTime() < t.getTime()) {
    throw new ActionError("You can only answer for tonight or future nights.", { [field]: ["Must be today or later"] });
  }
  if (diffDays(t, date) > MAX_DAYS_AHEAD) {
    throw new ActionError(`You can plan at most ${MAX_DAYS_AHEAD} days ahead.`, { [field]: ["Too far in the future"] });
  }
}

function revalidateOvernight() {
  for (const p of ["/me", "/me/overnight", "/me/meals", "/overnight", "/kitchen/today", "/dashboard"]) revalidatePath(p);
}

// ── One night ──

const nightSchema = z.object({
  date: zDate("Night"),
  status: zState,
  expectedReturnDate: zOptDate("Expected return date"),
  note: zOptText(300),
});

export const setNightStatus = defineAction(
  { permission: "self.student", schema: nightSchema, rateLimit: RATE },
  async (input, user) => {
    const studentId = await selfStudent(user);
    assertNotPast(input.date, "date");
    if (!(await isResidentOn(studentId, input.date))) {
      throw new ActionError(`You are not booked into the hostel on the night of ${formatDate(input.date)}.`);
    }
    const away = input.status === "AWAY";
    const expectedReturnDate = away ? input.expectedReturnDate : null;
    if (expectedReturnDate && expectedReturnDate.getTime() <= input.date.getTime()) {
      throw new ActionError("Expected return must be after the night you are away.", {
        expectedReturnDate: ["Must be after the away night"],
      });
    }

    await db.$transaction(async (tx) => {
      await tx.overnightStatus.upsert({
        where: { studentId_date: { studentId, date: input.date } },
        create: {
          studentId,
          date: input.date,
          status: input.status,
          expectedReturnDate,
          note: input.note,
          updatedById: user.id,
        },
        update: { status: input.status, expectedReturnDate, note: input.note, updatedById: user.id },
      });
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.OVERNIGHT_UPDATED,
        entityType: "Student",
        entityId: studentId,
        details: {
          dates: [toISODate(input.date)],
          status: input.status,
          expectedReturnDate: expectedReturnDate ? toISODate(expectedReturnDate) : null,
          source: "self",
        },
      });
    });
    revalidateOvernight();
    return {
      message: `${formatDate(input.date)}: marked as ${away ? "away" : "staying"}`,
    };
  },
);

// ── Clear one night (back to "Not responded") ──

export const clearNightStatus = defineAction(
  { permission: "self.student", schema: z.object({ date: zDate("Night") }), rateLimit: RATE },
  async (input, user) => {
    const studentId = await selfStudent(user);
    assertNotPast(input.date, "date");
    await db.$transaction(async (tx) => {
      const res = await tx.overnightStatus.deleteMany({ where: { studentId, date: input.date } });
      if (res.count > 0) {
        await logActivity(tx, {
          userId: user.id,
          action: ACTIONS.OVERNIGHT_UPDATED,
          entityType: "Student",
          entityId: studentId,
          details: { dates: [toISODate(input.date)], status: "CLEARED", source: "self" },
        });
      }
    });
    revalidateOvernight();
    return { message: `${formatDate(input.date)}: answer cleared` };
  },
);

// ── Date range ──

const rangeSchema = z.object({
  from: zDate("From"),
  to: zDate("To"),
  status: zState,
  expectedReturnDate: zOptDate("Expected return date"),
  note: zOptText(300),
});

export const setRangeStatus = defineAction(
  { permission: "self.student", schema: rangeSchema, rateLimit: RATE },
  async (input, user) => {
    const studentId = await selfStudent(user);
    assertNotPast(input.from, "from");
    if (input.to.getTime() < input.from.getTime()) {
      throw new ActionError("The end date must be on or after the start date.", { to: ["Must be on or after From"] });
    }
    const nights = diffDays(input.from, input.to) + 1;
    if (nights > MAX_RANGE_NIGHTS) {
      throw new ActionError(`A range can cover at most ${MAX_RANGE_NIGHTS} nights.`, {
        to: [`At most ${MAX_RANGE_NIGHTS} nights`],
      });
    }
    assertNotPast(input.to, "to");

    const away = input.status === "AWAY";
    let expectedReturnDate: Date | null = null;
    if (away) {
      expectedReturnDate = input.expectedReturnDate ?? addDays(input.to, 1);
      if (expectedReturnDate.getTime() <= input.to.getTime()) {
        throw new ActionError("Expected return must be after the last away night.", {
          expectedReturnDate: ["Must be after the To date"],
        });
      }
    }

    const dates: Date[] = [];
    for (let i = 0; i < nights; i++) dates.push(addDays(input.from, i));
    const resident = await Promise.all(dates.map((d) => isResidentOn(studentId, d)));
    const eligible = dates.filter((_, i) => resident[i]);
    if (eligible.length === 0) {
      throw new ActionError("You are not booked into the hostel on any of those nights.");
    }

    await db.$transaction(async (tx) => {
      for (const date of eligible) {
        await tx.overnightStatus.upsert({
          where: { studentId_date: { studentId, date } },
          create: { studentId, date, status: input.status, expectedReturnDate, note: input.note, updatedById: user.id },
          update: { status: input.status, expectedReturnDate, note: input.note, updatedById: user.id },
        });
      }
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.OVERNIGHT_UPDATED,
        entityType: "Student",
        entityId: studentId,
        details: {
          dates: eligible.map(toISODate),
          from: toISODate(input.from),
          to: toISODate(input.to),
          status: input.status,
          expectedReturnDate: expectedReturnDate ? toISODate(expectedReturnDate) : null,
          source: "self",
        },
      });
    }, { timeout: 20_000 });
    revalidateOvernight();

    const skipped = nights - eligible.length;
    const what = away ? "away" : "staying";
    return {
      message:
        `Marked ${eligible.length} night${eligible.length === 1 ? "" : "s"} as ${what}` +
        (skipped > 0 ? ` (${skipped} skipped — not booked in)` : ""),
    };
  },
);
