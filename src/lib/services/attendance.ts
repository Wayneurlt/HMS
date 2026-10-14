import "server-only";
import type { MealType, OvernightState } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { addDays, toISODate } from "@/lib/dates";

/**
 * Residency & meal expectation rules:
 *  - A student is a resident on night D when they have a stay with startDate ≤ D < endDate
 *    (endDate = move-out day, which is not a hostel night) — open stays have no endDate.
 *  - Each resident answers per night: STAYING, AWAY, or no answer ("NOT_RESPONDED").
 *  - Dinner on day D expects residents of night D who are not AWAY.
 *  - Breakfast on day D expects residents of night D−1 who were not AWAY that night
 *    (and who are still residents on day D). Weekend lunch uses the same rule: someone
 *    away the night before is assumed to be back only by the evening.
 *  - Not-responded residents ARE counted as expected (the hostel default is "here").
 */

export type NightAnswer = OvernightState | "NOT_RESPONDED";

export type ResidentNight = {
  studentId: string;
  fullName: string;
  phone: string;
  room: string;
  bed: string;
  status: NightAnswer;
  expectedReturnDate: Date | null;
  note: string | null;
};

export type NightSummary = {
  date: Date;
  residents: number;
  staying: number;
  away: number;
  notResponded: number;
  expected: number;
  students: ResidentNight[];
};

type Stay = {
  studentId: string;
  startDate: Date;
  endDate: Date | null;
  student: { fullName: string; phone: string };
  bed: { label: string; room: { name: string } };
};

async function staysOverlapping(client: Tx | typeof db, from: Date, to: Date): Promise<Stay[]> {
  return client.accommodation.findMany({
    where: {
      startDate: { lte: to },
      OR: [{ endDate: null }, { endDate: { gt: from } }],
      student: { deletedAt: null },
    },
    select: {
      studentId: true,
      startDate: true,
      endDate: true,
      student: { select: { fullName: true, phone: true } },
      bed: { select: { label: true, room: { select: { name: true } } } },
    },
    orderBy: { student: { fullName: "asc" } },
  });
}

function residentOn(stay: Pick<Stay, "startDate" | "endDate">, night: Date): boolean {
  return stay.startDate.getTime() <= night.getTime() && (!stay.endDate || stay.endDate.getTime() > night.getTime());
}

/** Per-night summaries for every night in [from, to] (inclusive). */
export async function nightSummaries(from: Date, to: Date, client: Tx | typeof db = db): Promise<NightSummary[]> {
  const [stays, answers] = await Promise.all([
    staysOverlapping(client, from, to),
    client.overnightStatus.findMany({
      where: { date: { gte: from, lte: to } },
      select: { studentId: true, date: true, status: true, expectedReturnDate: true, note: true },
    }),
  ]);
  const answerMap = new Map(answers.map((a) => [`${a.studentId}|${toISODate(a.date)}`, a]));

  const out: NightSummary[] = [];
  for (let d = from; d.getTime() <= to.getTime(); d = addDays(d, 1)) {
    const seen = new Set<string>();
    const students: ResidentNight[] = [];
    for (const s of stays) {
      if (!residentOn(s, d) || seen.has(s.studentId)) continue;
      seen.add(s.studentId);
      const a = answerMap.get(`${s.studentId}|${toISODate(d)}`);
      students.push({
        studentId: s.studentId,
        fullName: s.student.fullName,
        phone: s.student.phone,
        room: s.bed.room.name,
        bed: s.bed.label,
        status: a?.status ?? "NOT_RESPONDED",
        expectedReturnDate: a?.expectedReturnDate ?? null,
        note: a?.note ?? null,
      });
    }
    const staying = students.filter((s) => s.status === "STAYING").length;
    const away = students.filter((s) => s.status === "AWAY").length;
    const notResponded = students.length - staying - away;
    out.push({
      date: d,
      residents: students.length,
      staying,
      away,
      notResponded,
      expected: students.length - away,
      students,
    });
  }
  return out;
}

export async function nightSummary(date: Date, client: Tx | typeof db = db): Promise<NightSummary> {
  return (await nightSummaries(date, date, client))[0]!;
}

export type MealExpectation = {
  date: Date;
  type: MealType;
  expected: number;
  residents: number;
  away: number;
  expectedStudents: { studentId: string; fullName: string; room: string; bed: string; status: NightAnswer }[];
  awayStudents: { studentId: string; fullName: string; expectedReturnDate: Date | null }[];
};

/** Expected diners for a meal (see rules at the top of this file). */
export async function mealExpectation(date: Date, type: MealType, client: Tx | typeof db = db): Promise<MealExpectation> {
  if (type === "DINNER") {
    const n = await nightSummary(date, client);
    return {
      date,
      type,
      expected: n.expected,
      residents: n.residents,
      away: n.away,
      expectedStudents: n.students
        .filter((s) => s.status !== "AWAY")
        .map(({ studentId, fullName, room, bed, status }) => ({ studentId, fullName, room, bed, status })),
      awayStudents: n.students
        .filter((s) => s.status === "AWAY")
        .map(({ studentId, fullName, expectedReturnDate }) => ({ studentId, fullName, expectedReturnDate })),
    };
  }
  // Breakfast (and weekend lunch): based on the previous night, limited to students still resident today.
  const [prev, todayNight] = await nightSummaries(addDays(date, -1), date, client);
  const residentToday = new Set(todayNight!.students.map((s) => s.studentId));
  const pool = prev!.students.filter((s) => residentToday.has(s.studentId));
  // Students who moved in today weren't residents last night but may eat breakfast — exclude:
  // breakfast is served to those who slept at the hostel.
  const expectedStudents = pool.filter((s) => s.status !== "AWAY");
  const awayStudents = pool.filter((s) => s.status === "AWAY");
  return {
    date,
    type,
    expected: expectedStudents.length,
    residents: pool.length,
    away: awayStudents.length,
    expectedStudents: expectedStudents.map(({ studentId, fullName, room, bed, status }) => ({
      studentId,
      fullName,
      room,
      bed,
      status,
    })),
    awayStudents: awayStudents.map(({ studentId, fullName, expectedReturnDate }) => ({
      studentId,
      fullName,
      expectedReturnDate,
    })),
  };
}

/** Whether a student is a resident on a given night (used to validate overnight answers). */
export async function isResidentOn(studentId: string, night: Date, client: Tx | typeof db = db): Promise<boolean> {
  const count = await client.accommodation.count({
    where: {
      studentId,
      startDate: { lte: night },
      OR: [{ endDate: null }, { endDate: { gt: night } }],
    },
  });
  return count > 0;
}
