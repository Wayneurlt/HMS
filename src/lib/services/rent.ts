import "server-only";
import { Prisma, type PaymentMethod, type RentStatus } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import {
  addMonths,
  daysInMonth,
  dueDateFor,
  formatMonth,
  monthStart,
  monthsBetween,
  today as todayFn,
} from "@/lib/dates";
import { formatMoney, round2, toNumber } from "@/lib/format";
import { ACTIONS, logActivity } from "./activity";
import { notifyUsers } from "./notifications";
import { getSettings } from "./settings";

/**
 * Business rules:
 *  - outstanding = amountDue − amountPaid (amountPaid = sum of non-voided payments)
 *  - PAID when outstanding ≤ 0
 *  - OVERDUE when outstanding > 0 and the due date has passed (even if partially paid)
 *  - PARTIALLY_PAID when something is paid and not yet overdue
 *  - PENDING otherwise
 */
export function computeRentStatus(
  amountDue: number,
  amountPaid: number,
  dueDate: Date,
  today: Date = todayFn(),
): RentStatus {
  const outstanding = round2(amountDue - amountPaid);
  if (outstanding <= 0) return "PAID";
  if (dueDate.getTime() < today.getTime()) return "OVERDUE";
  if (amountPaid > 0) return "PARTIALLY_PAID";
  return "PENDING";
}

export function outstandingOf(inv: { amountDue: unknown; amountPaid: unknown }): number {
  return round2(toNumber(inv.amountDue as number) - toNumber(inv.amountPaid as number));
}

/** Mark unpaid invoices whose due date has passed as OVERDUE. Cheap; safe to call often. */
export async function syncRentStatuses(client: Tx | typeof db = db, today: Date = todayFn()): Promise<number> {
  const res = await client.rentInvoice.updateMany({
    where: { voidedAt: null, status: { in: ["PENDING", "PARTIALLY_PAID"] }, dueDate: { lt: today } },
    data: { status: "OVERDUE" },
  });
  return res.count;
}

/** Re-derive amountPaid and status of one invoice from its payments. Call inside a transaction. */
export async function recalcInvoice(tx: Tx, invoiceId: string): Promise<void> {
  const inv = await tx.rentInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const agg = await tx.rentPayment.aggregate({
    where: { invoiceId, voidedAt: null },
    _sum: { amount: true },
  });
  const paid = round2(toNumber(agg._sum.amount));
  await tx.rentInvoice.update({
    where: { id: invoiceId },
    data: {
      amountPaid: paid,
      status: computeRentStatus(toNumber(inv.amountDue), paid, inv.dueDate),
    },
  });
}

/** Row-lock an invoice for the rest of the transaction (prevents concurrent over-payment). */
async function lockInvoice(tx: Tx, invoiceId: string) {
  await tx.$queryRaw`SELECT id FROM "RentInvoice" WHERE id = ${invoiceId} FOR UPDATE`;
  const inv = await tx.rentInvoice.findUnique({
    where: { id: invoiceId },
    include: { student: { select: { id: true, fullName: true, userId: true } } },
  });
  if (!inv) throw new ActionError("Rent record not found.");
  return inv;
}

/**
 * Create any missing monthly rent invoices for accommodations, from the move-in month up to
 * `upTo` (default: the current month) or the move-out month. Idempotent — relies on the
 * unique (studentId, periodMonth) constraint.
 */
export async function ensureRentInvoices(
  client: Tx | typeof db = db,
  opts: { studentId?: string; upTo?: Date; userId?: string | null } = {},
): Promise<number> {
  const settings = await getSettings(client);
  const upToMonth = monthStart(opts.upTo ?? todayFn());

  const stays = await client.accommodation.findMany({
    where: {
      ...(opts.studentId ? { studentId: opts.studentId } : { isActive: true }),
      startDate: { lte: addMonths(upToMonth, 1) },
    },
    include: { student: { select: { id: true, rentDueDay: true, status: true } } },
  });

  let created = 0;
  for (const stay of stays) {
    const lastMonth =
      stay.endDate && monthStart(stay.endDate).getTime() < upToMonth.getTime() ? monthStart(stay.endDate) : upToMonth;
    const firstMonth = monthStart(stay.startDate);
    // A stay that starts in a future month still gets its first invoice.
    const months = monthsBetween(firstMonth, lastMonth.getTime() < firstMonth.getTime() ? firstMonth : lastMonth);
    if (months.length === 0) continue;

    const existing = await client.rentInvoice.findMany({
      where: { studentId: stay.studentId, periodMonth: { in: months } },
      select: { periodMonth: true },
    });
    const have = new Set(existing.map((e) => e.periodMonth.getTime()));
    const rent = toNumber(stay.monthlyRent);

    const data: Prisma.RentInvoiceCreateManyInput[] = [];
    for (const m of months) {
      if (have.has(m.getTime())) continue;
      const isFirst = m.getTime() === firstMonth.getTime();
      let amount = rent;
      if (isFirst && settings.prorateFirstMonth && stay.startDate.getUTCDate() > 1) {
        const dim = daysInMonth(m);
        const daysStayed = dim - stay.startDate.getUTCDate() + 1;
        amount = Math.round((rent * daysStayed) / dim);
      }
      let due = dueDateFor(m, stay.student.rentDueDay);
      if (isFirst && due.getTime() < stay.startDate.getTime()) due = stay.startDate;
      data.push({
        studentId: stay.studentId,
        accommodationId: stay.id,
        periodMonth: m,
        amountDue: amount,
        amountPaid: 0,
        dueDate: due,
        status: computeRentStatus(amount, 0, due),
      });
    }
    if (data.length) {
      const res = await client.rentInvoice.createMany({ data, skipDuplicates: true });
      created += res.count;
      if (res.count > 0) {
        await logActivity(client, {
          userId: opts.userId ?? null,
          action: ACTIONS.RENT_GENERATED,
          entityType: "Student",
          entityId: stay.studentId,
          details: { months: data.map((d) => formatMonth(d.periodMonth as Date)), count: res.count },
        });
      }
    }
  }
  return created;
}

export type PaymentInput = {
  invoiceId: string;
  amount: number;
  paidAt: Date;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
};

/** Record a (possibly partial) payment against a rent invoice. */
export async function recordPayment(input: PaymentInput, userId: string): Promise<{ paymentId: string }> {
  return db.$transaction(async (tx) => {
    const inv = await lockInvoice(tx, input.invoiceId);
    if (inv.voidedAt) throw new ActionError("This rent record has been voided.");
    const outstanding = outstandingOf(inv);
    if (outstanding <= 0) throw new ActionError("This rent record is already fully paid.");
    if (round2(input.amount) > outstanding) {
      throw new ActionError(`Amount exceeds the outstanding balance of ${formatMoney(outstanding)}.`, {
        amount: [`Maximum is ${formatMoney(outstanding)}`],
      });
    }
    if (input.reference) {
      const dup = await tx.rentPayment.findFirst({
        where: { reference: input.reference, method: input.method, voidedAt: null },
        select: { id: true },
      });
      if (dup) {
        throw new ActionError("A payment with this reference has already been recorded.", {
          reference: ["Duplicate transaction reference"],
        });
      }
    }

    const payment = await tx.rentPayment.create({
      data: {
        invoiceId: inv.id,
        studentId: inv.studentId,
        amount: round2(input.amount),
        paidAt: input.paidAt,
        method: input.method,
        reference: input.reference,
        notes: input.notes,
        recordedById: userId,
      },
    });
    await recalcInvoice(tx, inv.id);

    await logActivity(tx, {
      userId,
      action: ACTIONS.PAYMENT_RECORDED,
      entityType: "RentPayment",
      entityId: payment.id,
      details: {
        student: inv.student.fullName,
        month: formatMonth(inv.periodMonth),
        amount: round2(input.amount),
        method: input.method,
        reference: input.reference,
        outstandingBefore: outstanding,
        outstandingAfter: round2(outstanding - input.amount),
      },
    });
    if (inv.student.userId) {
      await notifyUsers(tx, [inv.student.userId], {
        type: "PAYMENT_RECEIVED",
        title: "Payment received",
        message: `We received ${formatMoney(input.amount)} for ${formatMonth(inv.periodMonth, "long")} rent. Thank you!`,
        link: "/me/rent",
      });
    }
    return { paymentId: payment.id };
  });
}

/** Owner-only correction of a payment. History is preserved in the activity log. */
export async function editPayment(
  paymentId: string,
  changes: Omit<PaymentInput, "invoiceId">,
  userId: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await tx.rentPayment.findUnique({ where: { id: paymentId } });
    if (!before) throw new ActionError("Payment not found.");
    if (before.voidedAt) throw new ActionError("Voided payments cannot be edited.");
    const inv = await lockInvoice(tx, before.invoiceId);
    const otherPaid = round2(toNumber(inv.amountPaid) - toNumber(before.amount));
    const maxAllowed = round2(toNumber(inv.amountDue) - otherPaid);
    if (round2(changes.amount) > maxAllowed) {
      throw new ActionError(`Amount exceeds what is owed on this invoice (${formatMoney(maxAllowed)} max).`, {
        amount: [`Maximum is ${formatMoney(maxAllowed)}`],
      });
    }
    await tx.rentPayment.update({
      where: { id: paymentId },
      data: {
        amount: round2(changes.amount),
        paidAt: changes.paidAt,
        method: changes.method,
        reference: changes.reference,
        notes: changes.notes,
      },
    });
    await recalcInvoice(tx, inv.id);
    await logActivity(tx, {
      userId,
      action: ACTIONS.PAYMENT_EDITED,
      entityType: "RentPayment",
      entityId: paymentId,
      details: {
        student: inv.student.fullName,
        before: {
          amount: toNumber(before.amount),
          paidAt: before.paidAt.toISOString().slice(0, 10),
          method: before.method,
          reference: before.reference,
        },
        after: {
          amount: round2(changes.amount),
          paidAt: changes.paidAt.toISOString().slice(0, 10),
          method: changes.method,
          reference: changes.reference,
        },
      },
    });
  });
}

/** Void (never delete) a payment; the invoice balance is restored. */
export async function voidPayment(paymentId: string, reason: string, userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const p = await tx.rentPayment.findUnique({ where: { id: paymentId } });
    if (!p) throw new ActionError("Payment not found.");
    if (p.voidedAt) throw new ActionError("Payment is already voided.");
    const inv = await lockInvoice(tx, p.invoiceId);
    await tx.rentPayment.update({
      where: { id: paymentId },
      data: { voidedAt: new Date(), voidedById: userId, voidReason: reason },
    });
    await recalcInvoice(tx, inv.id);
    await logActivity(tx, {
      userId,
      action: ACTIONS.PAYMENT_VOIDED,
      entityType: "RentPayment",
      entityId: paymentId,
      details: { student: inv.student.fullName, amount: toNumber(p.amount), reason },
    });
  });
}

/** Owner-only edit of an invoice's amount / due date / notes. */
export async function editInvoice(
  invoiceId: string,
  changes: { amountDue: number; dueDate: Date; notes: string | null },
  userId: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const inv = await lockInvoice(tx, invoiceId);
    if (inv.voidedAt) throw new ActionError("This rent record has been voided.");
    if (round2(changes.amountDue) < toNumber(inv.amountPaid)) {
      throw new ActionError(`Amount due cannot be less than what has been paid (${formatMoney(inv.amountPaid)}).`, {
        amountDue: ["Lower than amount already paid"],
      });
    }
    await tx.rentInvoice.update({
      where: { id: invoiceId },
      data: {
        amountDue: round2(changes.amountDue),
        dueDate: changes.dueDate,
        notes: changes.notes,
        status: computeRentStatus(changes.amountDue, toNumber(inv.amountPaid), changes.dueDate),
      },
    });
    await logActivity(tx, {
      userId,
      action: ACTIONS.RENT_EDITED,
      entityType: "RentInvoice",
      entityId: invoiceId,
      details: {
        student: inv.student.fullName,
        month: formatMonth(inv.periodMonth),
        before: { amountDue: toNumber(inv.amountDue), dueDate: inv.dueDate.toISOString().slice(0, 10) },
        after: { amountDue: round2(changes.amountDue), dueDate: changes.dueDate.toISOString().slice(0, 10) },
      },
    });
  });
}

/** Void an invoice that was raised in error. Only allowed when it has no active payments. */
export async function voidInvoice(invoiceId: string, reason: string, userId: string, client?: Tx): Promise<void> {
  const run = async (tx: Tx) => {
    const inv = await lockInvoice(tx, invoiceId);
    if (inv.voidedAt) return;
    if (toNumber(inv.amountPaid) > 0) {
      throw new ActionError("This rent record has payments. Void the payments first.");
    }
    await tx.rentInvoice.update({ where: { id: invoiceId }, data: { voidedAt: new Date(), voidReason: reason } });
    await logActivity(tx, {
      userId,
      action: ACTIONS.RENT_VOIDED,
      entityType: "RentInvoice",
      entityId: invoiceId,
      details: { student: inv.student.fullName, month: formatMonth(inv.periodMonth), reason },
    });
  };
  if (client) await run(client);
  else await db.$transaction(run);
}

// ── Read helpers ──

/** Total outstanding per student across all non-voided invoices. */
export async function outstandingByStudent(client: Tx | typeof db = db): Promise<Map<string, number>> {
  const rows = await client.rentInvoice.groupBy({
    by: ["studentId"],
    where: { voidedAt: null, status: { not: "PAID" } },
    _sum: { amountDue: true, amountPaid: true },
  });
  return new Map(rows.map((r) => [r.studentId, round2(toNumber(r._sum.amountDue) - toNumber(r._sum.amountPaid))]));
}

export async function studentOutstanding(studentId: string, client: Tx | typeof db = db): Promise<number> {
  const agg = await client.rentInvoice.aggregate({
    where: { studentId, voidedAt: null },
    _sum: { amountDue: true, amountPaid: true },
  });
  return round2(toNumber(agg._sum.amountDue) - toNumber(agg._sum.amountPaid));
}

/** Rent totals for invoices whose rent month falls in [from, to] and payments received in that period. */
export async function rentTotals(from: Date, to: Date, client: Tx | typeof db = db) {
  const [inv, paid, byStatus] = await Promise.all([
    client.rentInvoice.aggregate({
      where: { voidedAt: null, periodMonth: { gte: monthStart(from), lte: to } },
      _sum: { amountDue: true, amountPaid: true },
    }),
    client.rentPayment.aggregate({
      where: { voidedAt: null, paidAt: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    client.rentInvoice.groupBy({
      by: ["status"],
      where: { voidedAt: null, periodMonth: { gte: monthStart(from), lte: to } },
      _count: { _all: true },
    }),
  ]);
  const expected = round2(toNumber(inv._sum.amountDue));
  const paidAgainst = round2(toNumber(inv._sum.amountPaid));
  return {
    expected,
    paidAgainstPeriod: paidAgainst,
    outstanding: round2(expected - paidAgainst),
    collected: round2(toNumber(paid._sum.amount)),
    statusCounts: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Partial<Record<RentStatus, number>>,
  };
}
