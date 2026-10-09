import "server-only";
import { db, type Tx } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { dueDateFor, formatDate, monthStart } from "@/lib/dates";
import { round2, toNumber } from "@/lib/format";
import { ACTIONS, logActivity } from "./activity";
import { computeRentStatus, ensureRentInvoices, studentOutstanding, voidInvoice } from "./rent";

export const CHECKOUT_VOID_REASON = "Student checked out before this month";

/** Lock a bed row and verify it can take a new occupant. */
async function lockFreeBed(tx: Tx, bedId: string) {
  await tx.$queryRaw`SELECT id FROM "Bed" WHERE id = ${bedId} FOR UPDATE`;
  const bed = await tx.bed.findUnique({
    where: { id: bedId },
    include: { room: true, activeAccommodation: { select: { id: true } } },
  });
  if (!bed || bed.deletedAt || bed.room.deletedAt) throw new ActionError("Bed not found.", { bedId: ["Bed not found"] });
  if (!bed.room.isActive) throw new ActionError("That room is not active.", { bedId: ["Room is inactive"] });
  if (bed.activeAccommodation) {
    throw new ActionError("That bed is already occupied. Choose another bed.", { bedId: ["Bed is occupied"] });
  }
  if (bed.status === "OCCUPIED" || bed.status === "MAINTENANCE") {
    throw new ActionError(`That bed is not available (${bed.status.toLowerCase()}).`, { bedId: ["Bed unavailable"] });
  }
  return bed;
}

export type CheckInInput = {
  studentId: string;
  bedId: string;
  startDate: Date;
  monthlyRent: number;
  rentDueDay: number;
};

/**
 * Check a student in: assigns the bed, marks it occupied, creates the active accommodation,
 * activates the student and generates the rent schedule. All in one transaction.
 */
export async function checkInStudent(input: CheckInInput, userId: string, client?: Tx): Promise<{ accommodationId: string }> {
  const run = async (tx: Tx) => {
    await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${input.studentId} FOR UPDATE`;
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      include: { activeAccommodation: { select: { id: true } } },
    });
    if (!student || student.deletedAt) throw new ActionError("Student not found.");
    if (student.activeAccommodation) throw new ActionError("This student is already checked in to a bed.");

    const bed = await lockFreeBed(tx, input.bedId);

    const stay = await tx.accommodation.create({
      data: {
        studentId: student.id,
        bedId: bed.id,
        activeStudentId: student.id,
        activeBedId: bed.id,
        startDate: input.startDate,
        monthlyRent: round2(input.monthlyRent),
        isActive: true,
        checkedInById: userId,
      },
    });
    await tx.bed.update({ where: { id: bed.id }, data: { status: "OCCUPIED" } });
    await tx.student.update({
      where: { id: student.id },
      data: {
        status: "ACTIVE",
        moveInDate: input.startDate,
        moveOutDate: null,
        monthlyRent: round2(input.monthlyRent),
        rentDueDay: input.rentDueDay,
      },
    });
    if (student.userId) {
      await tx.user.update({ where: { id: student.userId }, data: { isActive: true } });
    }

    // Re-admission: revive invoices that were auto-voided at a previous check-out for months
    // this new stay covers (the unique student+month constraint would otherwise skip them).
    const revived = await tx.rentInvoice.findMany({
      where: {
        studentId: student.id,
        voidReason: CHECKOUT_VOID_REASON,
        voidedAt: { not: null },
        periodMonth: { gte: monthStart(input.startDate) },
      },
    });
    for (const inv of revived) {
      const due = dueDateFor(inv.periodMonth, input.rentDueDay);
      const dueDate = due.getTime() < input.startDate.getTime() ? input.startDate : due;
      await tx.rentInvoice.update({
        where: { id: inv.id },
        data: {
          voidedAt: null,
          voidReason: null,
          accommodationId: stay.id,
          amountDue: round2(input.monthlyRent),
          amountPaid: 0,
          dueDate,
          status: computeRentStatus(round2(input.monthlyRent), 0, dueDate),
        },
      });
    }

    await ensureRentInvoices(tx, { studentId: student.id, upTo: input.startDate, userId });
    await ensureRentInvoices(tx, { studentId: student.id, userId });

    await logActivity(tx, {
      userId,
      action: ACTIONS.STUDENT_CHECKED_IN,
      entityType: "Student",
      entityId: student.id,
      details: {
        student: student.fullName,
        room: bed.room.name,
        bed: bed.label,
        moveIn: formatDate(input.startDate),
        monthlyRent: round2(input.monthlyRent),
        rentDueDay: input.rentDueDay,
      },
    });
    await logActivity(tx, {
      userId,
      action: ACTIONS.BED_ASSIGNED,
      entityType: "Bed",
      entityId: bed.id,
      details: { student: student.fullName, room: bed.room.name, bed: bed.label },
    });
    return { accommodationId: stay.id };
  };
  return client ? run(client) : db.$transaction(run);
}

export type CheckOutInput = { studentId: string; moveOutDate: Date; notes: string | null };

/**
 * Check a student out: closes the stay, releases the bed, marks the student CHECKED_OUT,
 * voids unpaid invoices for months after the move-out month, removes future overnight
 * answers and disables the student's login. Payments and past invoices are kept.
 */
export async function checkOutStudent(input: CheckOutInput, userId: string): Promise<{ outstanding: number }> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${input.studentId} FOR UPDATE`;
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      include: { activeAccommodation: { include: { bed: { include: { room: true } } } } },
    });
    if (!student) throw new ActionError("Student not found.");
    const stay = student.activeAccommodation;
    if (!stay) throw new ActionError("This student is not currently checked in.");
    if (input.moveOutDate.getTime() < stay.startDate.getTime()) {
      throw new ActionError("Move-out date cannot be before the move-in date.", {
        moveOutDate: [`Must be on or after ${formatDate(stay.startDate)}`],
      });
    }

    await tx.accommodation.update({
      where: { id: stay.id },
      data: {
        isActive: false,
        endDate: input.moveOutDate,
        activeBedId: null,
        activeStudentId: null,
        checkedOutById: userId,
        checkoutNotes: input.notes,
      },
    });
    await tx.bed.update({ where: { id: stay.bedId }, data: { status: "AVAILABLE" } });
    await tx.student.update({
      where: { id: student.id },
      data: { status: "CHECKED_OUT", moveOutDate: input.moveOutDate },
    });

    // Future rent: void unpaid invoices for months after the move-out month.
    const future = await tx.rentInvoice.findMany({
      where: { studentId: student.id, voidedAt: null, periodMonth: { gt: monthStart(input.moveOutDate) } },
    });
    for (const inv of future) {
      if (toNumber(inv.amountPaid) === 0) {
        await voidInvoice(inv.id, CHECKOUT_VOID_REASON, userId, tx);
      }
    }

    // Future overnight answers no longer apply.
    // (The move-out night itself is not a hostel night: residency is startDate ≤ night < endDate.)
    await tx.overnightStatus.deleteMany({
      where: { studentId: student.id, date: { gte: input.moveOutDate } },
    });

    if (student.userId) {
      await tx.user.update({ where: { id: student.userId }, data: { isActive: false } });
      await tx.session.deleteMany({ where: { userId: student.userId } });
    }

    const outstanding = await studentOutstanding(student.id, tx);
    await logActivity(tx, {
      userId,
      action: ACTIONS.STUDENT_CHECKED_OUT,
      entityType: "Student",
      entityId: student.id,
      details: {
        student: student.fullName,
        room: stay.bed.room.name,
        bed: stay.bed.label,
        moveIn: formatDate(stay.startDate),
        moveOut: formatDate(input.moveOutDate),
        outstandingAtCheckout: outstanding,
        notes: input.notes,
      },
    });
    return { outstanding };
  });
}

/** Move an active student to a different bed. Rent is unchanged. */
export async function changeBed(
  input: { studentId: string; newBedId: string; effectiveDate: Date },
  userId: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${input.studentId} FOR UPDATE`;
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      include: { activeAccommodation: { include: { bed: { include: { room: true } } } } },
    });
    if (!student) throw new ActionError("Student not found.");
    const stay = student.activeAccommodation;
    if (!stay) throw new ActionError("This student is not currently checked in.");
    if (stay.bedId === input.newBedId) throw new ActionError("The student is already in that bed.");
    if (input.effectiveDate.getTime() < stay.startDate.getTime()) {
      throw new ActionError("Effective date cannot be before the current move-in date.");
    }

    const newBed = await lockFreeBed(tx, input.newBedId);
    await tx.accommodation.update({
      where: { id: stay.id },
      data: { isActive: false, endDate: input.effectiveDate, activeBedId: null, activeStudentId: null, checkedOutById: userId },
    });
    await tx.bed.update({ where: { id: stay.bedId }, data: { status: "AVAILABLE" } });
    await tx.accommodation.create({
      data: {
        studentId: student.id,
        bedId: newBed.id,
        activeBedId: newBed.id,
        activeStudentId: student.id,
        startDate: input.effectiveDate,
        monthlyRent: stay.monthlyRent,
        isActive: true,
        checkedInById: userId,
      },
    });
    await tx.bed.update({ where: { id: newBed.id }, data: { status: "OCCUPIED" } });
    await logActivity(tx, {
      userId,
      action: ACTIONS.STUDENT_BED_CHANGED,
      entityType: "Student",
      entityId: student.id,
      details: {
        student: student.fullName,
        from: `${stay.bed.room.name} · ${stay.bed.label}`,
        to: `${newBed.room.name} · ${newBed.label}`,
        effective: formatDate(input.effectiveDate),
      },
    });
  });
}
