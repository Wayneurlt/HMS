import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

/**
 * Read helpers for the student portal. Every function takes the studentId from the
 * session (requireStudentSelf) — never from the request.
 */

export async function getMyStudent(studentId: string) {
  const s = await db.student.findUnique({
    where: { id: studentId },
    include: {
      activeAccommodation: {
        select: {
          id: true,
          startDate: true,
          monthlyRent: true,
          bed: { select: { id: true, label: true, room: { select: { id: true, name: true, floor: true } } } },
        },
      },
    },
  });
  if (!s || s.deletedAt) notFound();
  return s;
}

/** The student's own stays (only date ranges), for residency display. */
export async function getMyStays(studentId: string) {
  return db.accommodation.findMany({
    where: { studentId },
    select: { startDate: true, endDate: true },
  });
}

export function residentOnNight(stays: { startDate: Date; endDate: Date | null }[], night: Date): boolean {
  return stays.some(
    (s) => s.startDate.getTime() <= night.getTime() && (!s.endDate || s.endDate.getTime() > night.getTime()),
  );
}

/** Students may answer overnight questions while ACTIVE or SUSPENDED. */
export function canAnswerOvernight(status: string): boolean {
  return status === "ACTIVE" || status === "SUSPENDED";
}
