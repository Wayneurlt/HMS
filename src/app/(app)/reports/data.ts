import "server-only";
import type { BedStatus, ExpenseCategory, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  addDays,
  addMonths,
  diffDays,
  formatMonth,
  monthEnd,
  monthStart,
  monthsBetween,
  parseDateOnly,
  today as todayFn,
  todayISO,
  toISODate,
} from "@/lib/dates";
import { round2, toNumber } from "@/lib/format";
import { rentTotals } from "@/lib/services/rent";
import { nightSummary } from "@/lib/services/attendance";

/**
 * Report data shared by the /reports page and the CSV export route.
 * All inputs come from query strings, so everything is validated here with safe fallbacks.
 */

// ───────────────────────── Range ─────────────────────────

export type RangePreset = "this-month" | "last-month" | "last-3-months" | "this-year" | "custom";

export type ReportRange = { from: Date; to: Date; preset: RangePreset };

const MAX_RANGE_DAYS = 366 * 3;

export function presetRange(preset: Exclude<RangePreset, "custom">, now: Date = todayFn()): { from: Date; to: Date } {
  switch (preset) {
    case "last-month": {
      const m = addMonths(monthStart(now), -1);
      return { from: m, to: monthEnd(m) };
    }
    case "last-3-months":
      return { from: addMonths(monthStart(now), -2), to: monthEnd(now) };
    case "this-year":
      return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to: new Date(Date.UTC(now.getUTCFullYear(), 11, 31)) };
    case "this-month":
    default:
      return { from: monthStart(now), to: monthEnd(now) };
  }
}

function safeDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  try {
    return parseDateOnly(v.trim());
  } catch {
    return null;
  }
}

/** Parse ?from&to (YYYY-MM-DD). Invalid / reversed / huge ranges fall back to this month. */
export function parseRange(params: { from?: string | null; to?: string | null }): ReportRange {
  const from = safeDate(params.from);
  const to = safeDate(params.to);
  if (from && to && from.getTime() <= to.getTime() && diffDays(from, to) <= MAX_RANGE_DAYS) {
    for (const p of ["this-month", "last-month", "last-3-months", "this-year"] as const) {
      const r = presetRange(p);
      if (r.from.getTime() === from.getTime() && r.to.getTime() === to.getTime()) return { from, to, preset: p };
    }
    return { from, to, preset: "custom" };
  }
  return { ...presetRange("this-month"), preset: "this-month" };
}

export const EXPENSE_CATEGORIES = [
  "FOOD",
  "GAS",
  "WATER",
  "CLEANING_SUPPLIES",
  "EQUIPMENT",
  "TRANSPORT",
  "OTHER",
] as const satisfies readonly ExpenseCategory[];

export function parseCategory(v: string | null | undefined): ExpenseCategory | null {
  return v && (EXPENSE_CATEGORIES as readonly string[]).includes(v) ? (v as ExpenseCategory) : null;
}

/** Real timestamps (createdAt) are compared by their hostel-local calendar day. */
function inRangeLocal(ts: Date, from: Date, to: Date): boolean {
  const iso = todayISO(ts);
  return iso >= toISODate(from) && iso <= toISODate(to);
}

/** Inclusive night overlap of a stay [start, end) with [from, to]. */
function stayNights(start: Date, end: Date | null, from: Date, to: Date): number {
  const first = start.getTime() > from.getTime() ? start : from;
  const lastNight = end ? addDays(end, -1) : to;
  const last = lastNight.getTime() < to.getTime() ? lastNight : to;
  return Math.max(0, diffDays(first, last) + 1);
}

// ───────────────────────── Occupancy ─────────────────────────

export async function occupancyReport(range: ReportRange) {
  const today = todayFn();
  const beds = await db.bed.findMany({
    where: { deletedAt: null, room: { deletedAt: null } },
    select: { status: true },
  });
  const counts: Record<BedStatus, number> = { AVAILABLE: 0, OCCUPIED: 0, RESERVED: 0, MAINTENANCE: 0 };
  for (const b of beds) counts[b.status] += 1;
  const totalBeds = beds.length;
  const occupancyRate = totalBeds ? (counts.OCCUPIED / totalBeds) * 100 : 0;

  // Average occupancy over the range: resident-nights ÷ (beds × nights). Future nights are
  // excluded (they have not happened yet). Uses the current bed count as the capacity.
  const effectiveTo = range.to.getTime() > today.getTime() ? today : range.to;
  const stays =
    effectiveTo.getTime() >= range.from.getTime()
      ? await db.accommodation.findMany({
          where: { startDate: { lte: effectiveTo }, OR: [{ endDate: null }, { endDate: { gt: range.from } }] },
          select: { startDate: true, endDate: true },
        })
      : [];

  const months = monthsBetween(range.from, range.to).map((m) => {
    const mFrom = m.getTime() < range.from.getTime() ? range.from : m;
    const mEndRaw = monthEnd(m);
    const mTo = mEndRaw.getTime() > effectiveTo.getTime() ? effectiveTo : mEndRaw;
    const nights = mTo.getTime() >= mFrom.getTime() ? diffDays(mFrom, mTo) + 1 : 0;
    const residentNights = nights ? stays.reduce((a, s) => a + stayNights(s.startDate, s.endDate, mFrom, mTo), 0) : 0;
    return {
      month: formatMonth(m),
      nights,
      residentNights,
      rate: nights && totalBeds ? round2((residentNights / (totalBeds * nights)) * 100) : 0,
    };
  });
  const nights = months.reduce((a, m) => a + m.nights, 0);
  const residentNights = months.reduce((a, m) => a + m.residentNights, 0);
  const averageRate = nights && totalBeds ? (residentNights / (totalBeds * nights)) * 100 : null;

  return {
    totalBeds,
    occupied: counts.OCCUPIED,
    vacant: counts.AVAILABLE,
    reserved: counts.RESERVED,
    maintenance: counts.MAINTENANCE,
    occupancyRate,
    averageRate,
    residentNights,
    nights,
    months: months.map((m) => ({ month: m.month, rate: m.rate })),
  };
}

export async function occupancyCsvRows() {
  const beds = await db.bed.findMany({
    where: { deletedAt: null, room: { deletedAt: null } },
    orderBy: [{ room: { name: "asc" } }, { label: "asc" }],
    select: {
      label: true,
      status: true,
      room: { select: { name: true, floor: true } },
      activeAccommodation: { select: { startDate: true, monthlyRent: true, student: { select: { fullName: true, phone: true } } } },
    },
  });
  return {
    headers: ["Room", "Floor", "Bed", "Status", "Student", "Phone", "Since", "Monthly rent"],
    rows: beds.map((b) => [
      b.room.name,
      b.room.floor ?? "",
      b.label,
      b.status,
      b.activeAccommodation?.student.fullName ?? "",
      b.activeAccommodation?.student.phone ?? "",
      b.activeAccommodation ? toISODate(b.activeAccommodation.startDate) : "",
      b.activeAccommodation ? toNumber(b.activeAccommodation.monthlyRent) : "",
    ]),
  };
}

// ───────────────────────── Rent ─────────────────────────

export type StudentRentStatus = "PAID" | "PARTIALLY_PAID" | "OVERDUE" | "PENDING";

function invoiceWhere(range: ReportRange): Prisma.RentInvoiceWhereInput {
  return { voidedAt: null, periodMonth: { gte: monthStart(range.from), lte: range.to } };
}

export async function rentReport(range: ReportRange) {
  const today = todayFn();
  const [totals, invoices, payments] = await Promise.all([
    rentTotals(range.from, range.to),
    db.rentInvoice.findMany({
      where: invoiceWhere(range),
      select: {
        studentId: true,
        periodMonth: true,
        amountDue: true,
        amountPaid: true,
        dueDate: true,
        student: { select: { fullName: true, status: true } },
      },
    }),
    db.rentPayment.findMany({
      where: { voidedAt: null, paidAt: { gte: range.from, lte: range.to } },
      select: { amount: true, paidAt: true },
    }),
  ]);

  const byStudent = new Map<
    string,
    { studentId: string; name: string; studentStatus: string; expected: number; paid: number; outstanding: number; overdue: boolean }
  >();
  for (const inv of invoices) {
    const due = toNumber(inv.amountDue);
    const paid = toNumber(inv.amountPaid);
    const out = round2(due - paid);
    const row = byStudent.get(inv.studentId) ?? {
      studentId: inv.studentId,
      name: inv.student.fullName,
      studentStatus: inv.student.status,
      expected: 0,
      paid: 0,
      outstanding: 0,
      overdue: false,
    };
    row.expected = round2(row.expected + due);
    row.paid = round2(row.paid + paid);
    row.outstanding = round2(row.outstanding + out);
    if (out > 0 && inv.dueDate.getTime() < today.getTime()) row.overdue = true;
    byStudent.set(inv.studentId, row);
  }
  const students = [...byStudent.values()]
    .map((r) => {
      const status: StudentRentStatus =
        r.outstanding <= 0 ? "PAID" : r.overdue ? "OVERDUE" : r.paid > 0 ? "PARTIALLY_PAID" : "PENDING";
      return { ...r, status };
    })
    .sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name));

  const studentCounts = { PAID: 0, PARTIALLY_PAID: 0, OVERDUE: 0, PENDING: 0 } as Record<StudentRentStatus, number>;
  for (const s of students) studentCounts[s.status] += 1;

  const months = monthsBetween(range.from, range.to).map((m) => {
    const key = m.getTime();
    const collected = payments
      .filter((p) => monthStart(p.paidAt).getTime() === key)
      .reduce((a, p) => a + toNumber(p.amount), 0);
    const outstanding = invoices
      .filter((i) => i.periodMonth.getTime() === key)
      .reduce((a, i) => a + Math.max(0, toNumber(i.amountDue) - toNumber(i.amountPaid)), 0);
    return { month: formatMonth(m), collected: round2(collected), outstanding: round2(outstanding) };
  });

  return { totals, students, studentCounts, months };
}

export async function rentCsvRows(range: ReportRange) {
  const invoices = await db.rentInvoice.findMany({
    where: invoiceWhere(range),
    orderBy: [{ periodMonth: "asc" }, { student: { fullName: "asc" } }],
    select: {
      periodMonth: true,
      dueDate: true,
      amountDue: true,
      amountPaid: true,
      status: true,
      student: { select: { fullName: true, phone: true } },
    },
  });
  return {
    headers: ["Student", "Phone", "Month", "Due date", "Amount due", "Paid", "Outstanding", "Status"],
    rows: invoices.map((i) => [
      i.student.fullName,
      i.student.phone,
      formatMonth(i.periodMonth),
      toISODate(i.dueDate),
      toNumber(i.amountDue),
      toNumber(i.amountPaid),
      round2(toNumber(i.amountDue) - toNumber(i.amountPaid)),
      i.status,
    ]),
  };
}

export async function paymentsCsvRows(range: ReportRange) {
  const payments = await db.rentPayment.findMany({
    where: { paidAt: { gte: range.from, lte: range.to } },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    select: {
      paidAt: true,
      amount: true,
      method: true,
      reference: true,
      notes: true,
      voidedAt: true,
      voidReason: true,
      student: { select: { fullName: true } },
      invoice: { select: { periodMonth: true } },
      recordedBy: { select: { name: true } },
    },
  });
  return {
    headers: ["Date", "Student", "Rent month", "Amount", "Method", "Reference", "Notes", "Recorded by", "Voided", "Void reason"],
    rows: payments.map((p) => [
      toISODate(p.paidAt),
      p.student.fullName,
      formatMonth(p.invoice.periodMonth),
      toNumber(p.amount),
      p.method,
      p.reference ?? "",
      p.notes ?? "",
      p.recordedBy?.name ?? "",
      p.voidedAt ? "Yes" : "No",
      p.voidReason ?? "",
    ]),
  };
}

// ───────────────────────── Students ─────────────────────────

/**
 * Move-ins and move-outs in the range. A bed change ends one stay and starts another on the
 * same day for the same student — those are not counted as a check-out or a new student.
 */
async function movements(range: ReportRange) {
  const touching = await db.accommodation.findMany({
    where: {
      student: { deletedAt: null },
      OR: [
        { startDate: { gte: range.from, lte: range.to } },
        { endDate: { gte: range.from, lte: range.to } },
      ],
    },
    select: { studentId: true },
  });
  const ids = [...new Set(touching.map((t) => t.studentId))];
  const ins: { studentId: string; date: Date }[] = [];
  const outs: { studentId: string; date: Date }[] = [];
  if (ids.length > 0) {
    const stays = await db.accommodation.findMany({
      where: { studentId: { in: ids } },
      select: { studentId: true, startDate: true, endDate: true },
    });
    const within = (d: Date) => d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime();
    for (const s of stays) {
      const own = stays.filter((o) => o.studentId === s.studentId && o !== s);
      if (within(s.startDate) && !own.some((o) => o.endDate && o.endDate.getTime() === s.startDate.getTime())) {
        ins.push({ studentId: s.studentId, date: s.startDate });
      }
      const end = s.endDate;
      if (end && within(end) && !own.some((o) => o.startDate.getTime() === end.getTime())) {
        outs.push({ studentId: s.studentId, date: end });
      }
    }
  }
  return { ins, outs, newIds: new Set(ins.map((i) => i.studentId)), outIds: new Set(outs.map((o) => o.studentId)) };
}

export async function studentsReport(range: ReportRange) {
  const [active, pending, suspended, mv, tonight] = await Promise.all([
    db.student.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    db.student.count({ where: { deletedAt: null, status: "PENDING" } }),
    db.student.count({ where: { deletedAt: null, status: "SUSPENDED" } }),
    movements(range),
    nightSummary(todayFn()),
  ]);

  const countIn = (events: { studentId: string; date: Date }[], m: Date) =>
    new Set(events.filter((e) => monthStart(e.date).getTime() === m.getTime()).map((e) => e.studentId)).size;
  const months = monthsBetween(range.from, range.to).map((m) => ({
    month: formatMonth(m),
    moveIns: countIn(mv.ins, m),
    moveOuts: countIn(mv.outs, m),
  }));

  return {
    active,
    pending,
    suspended,
    newStudents: mv.newIds.size,
    checkedOut: mv.outIds.size,
    residentsTonight: tonight.residents,
    awayTonight: tonight.away,
    notRespondedTonight: tonight.notResponded,
    months,
  };
}

export async function studentsCsvRows(range: ReportRange) {
  const [students, mv] = await Promise.all([
    db.student.findMany({
      where: { deletedAt: null },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        status: true,
        monthlyRent: true,
        moveInDate: true,
        moveOutDate: true,
        activeAccommodation: { select: { bed: { select: { label: true, room: { select: { name: true } } } } } },
      },
    }),
    movements(range),
  ]);
  return {
    headers: ["Name", "Phone", "Email", "Status", "Room", "Bed", "Monthly rent", "Move-in", "Move-out", "New in period", "Checked out in period"],
    rows: students.map((s) => [
      s.fullName,
      s.phone,
      s.email ?? "",
      s.status,
      s.activeAccommodation?.bed.room.name ?? "",
      s.activeAccommodation?.bed.label ?? "",
      toNumber(s.monthlyRent),
      s.moveInDate ? toISODate(s.moveInDate) : "",
      s.moveOutDate ? toISODate(s.moveOutDate) : "",
      mv.newIds.has(s.id) ? "Yes" : "No",
      mv.outIds.has(s.id) ? "Yes" : "No",
    ]),
  };
}

// ───────────────────────── Kitchen ─────────────────────────

export async function kitchenReport(range: ReportRange, category: ExpenseCategory | null) {
  const [purchases, expenses, mealRecords, movementsRaw] = await Promise.all([
    db.purchase.findMany({
      where: { voidedAt: null, purchaseDate: { gte: range.from, lte: range.to } },
      select: { totalCost: true, purchaseDate: true },
    }),
    db.kitchenExpense.findMany({
      where: { voidedAt: null, expenseDate: { gte: range.from, lte: range.to } },
      select: { amount: true, category: true, expenseDate: true },
    }),
    db.mealRecord.findMany({
      where: { meal: { date: { gte: range.from, lte: range.to } } },
      select: { servedCount: true, leftoverPortions: true, expectedCount: true },
    }),
    // Widen by a day on each side, then filter by hostel-local day (createdAt is a timestamp).
    db.inventoryTransaction.findMany({
      where: {
        type: { in: ["CONSUMPTION", "WASTE"] },
        createdAt: { gte: addDays(range.from, -1), lt: addDays(range.to, 2) },
      },
      select: {
        type: true,
        quantityChange: true,
        createdAt: true,
        item: { select: { id: true, name: true, unit: true } },
      },
    }),
  ]);

  const purchasesTotal = round2(purchases.reduce((a, p) => a + toNumber(p.totalCost), 0));
  const allExpensesTotal = round2(expenses.reduce((a, e) => a + toNumber(e.amount), 0));
  const foodExpenses = round2(expenses.filter((e) => e.category === "FOOD").reduce((a, e) => a + toNumber(e.amount), 0));
  const foodCost = round2(purchasesTotal + foodExpenses);
  const kitchenTotal = round2(purchasesTotal + allExpensesTotal);
  const mealsServed = mealRecords.reduce((a, r) => a + r.servedCount, 0);
  const mealsExpected = mealRecords.reduce((a, r) => a + r.expectedCount, 0);
  const leftovers = round2(mealRecords.reduce((a, r) => a + toNumber(r.leftoverPortions), 0));
  const costPerMeal = mealsServed > 0 ? round2(foodCost / mealsServed) : null;

  // Expense parts honour the optional category filter.
  const filtered = category ? expenses.filter((e) => e.category === category) : expenses;
  const filteredTotal = round2(filtered.reduce((a, e) => a + toNumber(e.amount), 0));
  const byCategory = EXPENSE_CATEGORIES.map((c) => ({
    name: c,
    value: round2(filtered.filter((e) => e.category === c).reduce((a, e) => a + toNumber(e.amount), 0)),
  })).filter((c) => c.value > 0);

  const months = monthsBetween(range.from, range.to).map((m) => {
    const key = m.getTime();
    return {
      month: formatMonth(m),
      purchases: round2(purchases.filter((p) => monthStart(p.purchaseDate).getTime() === key).reduce((a, p) => a + toNumber(p.totalCost), 0)),
      expenses: round2(filtered.filter((e) => monthStart(e.expenseDate).getTime() === key).reduce((a, e) => a + toNumber(e.amount), 0)),
    };
  });

  const usageMap = new Map<string, { item: string; unit: string; consumed: number; wasted: number }>();
  for (const t of movementsRaw) {
    if (!inRangeLocal(t.createdAt, range.from, range.to)) continue;
    const row = usageMap.get(t.item.id) ?? { item: t.item.name, unit: t.item.unit, consumed: 0, wasted: 0 };
    const qty = Math.abs(toNumber(t.quantityChange));
    if (t.type === "WASTE") row.wasted += qty;
    else row.consumed += qty;
    usageMap.set(t.item.id, row);
  }
  const usage = [...usageMap.values()]
    .map((u) => ({ ...u, consumed: Math.round(u.consumed * 1000) / 1000, wasted: Math.round(u.wasted * 1000) / 1000 }))
    .sort((a, b) => b.consumed + b.wasted - (a.consumed + a.wasted));

  return {
    purchasesTotal,
    purchasesCount: purchases.length,
    allExpensesTotal,
    foodExpenses,
    foodCost,
    kitchenTotal,
    mealsServed,
    mealsExpected,
    mealsRecorded: mealRecords.length,
    leftovers,
    costPerMeal,
    filteredExpensesTotal: filteredTotal,
    filteredExpensesCount: filtered.length,
    byCategory,
    months,
    usage,
  };
}

export async function kitchenCsvRows(range: ReportRange, category: ExpenseCategory | null) {
  const k = await kitchenReport(range, category);
  const rows: unknown[][] = [
    ["Summary", "Period", `${toISODate(range.from)} to ${toISODate(range.to)}`, ""],
    ["Summary", "Food purchases (count)", k.purchasesCount, ""],
    ["Summary", "Food purchases (total)", k.purchasesTotal, "KES"],
    ["Summary", "Kitchen expenses (all categories)", k.allExpensesTotal, "KES"],
    ["Summary", "Kitchen expenses (FOOD)", k.foodExpenses, "KES"],
    ["Summary", "Total food expenditure", k.foodCost, "KES"],
    ["Summary", "Total kitchen expenditure", k.kitchenTotal, "KES"],
    ["Summary", "Meals served", k.mealsServed, "portions"],
    ["Summary", "Average cost per meal", k.costPerMeal ?? "", "KES"],
    ["Summary", "Leftover portions", k.leftovers, "portions"],
    ...k.byCategory.map((c) => ["Expenses by category", c.name, c.value, "KES"]),
    ...k.months.map((m) => ["Monthly", `${m.month} purchases`, m.purchases, "KES"]),
    ...k.months.map((m) => ["Monthly", `${m.month} expenses`, m.expenses, "KES"]),
    ...k.usage.map((u) => ["Stock used", u.item, u.consumed, u.unit]),
    ...k.usage.filter((u) => u.wasted > 0).map((u) => ["Stock wasted", u.item, u.wasted, u.unit]),
  ];
  return { headers: ["Section", "Metric", "Value", "Unit"], rows };
}

export async function expensesCsvRows(range: ReportRange, category: ExpenseCategory | null) {
  const expenses = await db.kitchenExpense.findMany({
    where: { expenseDate: { gte: range.from, lte: range.to }, ...(category ? { category } : {}) },
    orderBy: [{ expenseDate: "asc" }, { createdAt: "asc" }],
    select: {
      expenseDate: true,
      category: true,
      description: true,
      amount: true,
      paymentMethod: true,
      reference: true,
      notes: true,
      voidedAt: true,
      voidReason: true,
      recordedBy: { select: { name: true } },
    },
  });
  return {
    headers: ["Date", "Category", "Description", "Amount", "Payment method", "Reference", "Notes", "Recorded by", "Voided", "Void reason"],
    rows: expenses.map((e) => [
      toISODate(e.expenseDate),
      e.category,
      e.description,
      toNumber(e.amount),
      e.paymentMethod,
      e.reference ?? "",
      e.notes ?? "",
      e.recordedBy?.name ?? "",
      e.voidedAt ? "Yes" : "No",
      e.voidReason ?? "",
    ]),
  };
}

export async function purchasesCsvRows(range: ReportRange) {
  const purchases = await db.purchase.findMany({
    where: { purchaseDate: { gte: range.from, lte: range.to } },
    orderBy: [{ purchaseDate: "asc" }, { createdAt: "asc" }],
    select: {
      purchaseDate: true,
      quantity: true,
      unit: true,
      unitCost: true,
      totalCost: true,
      supplier: true,
      reference: true,
      voidedAt: true,
      voidReason: true,
      item: { select: { name: true, category: true } },
      recordedBy: { select: { name: true } },
    },
  });
  return {
    headers: ["Date", "Item", "Category", "Quantity", "Unit", "Unit cost", "Total cost", "Supplier", "Reference", "Recorded by", "Voided", "Void reason"],
    rows: purchases.map((p) => [
      toISODate(p.purchaseDate),
      p.item.name,
      p.item.category,
      toNumber(p.quantity),
      p.unit,
      toNumber(p.unitCost),
      toNumber(p.totalCost),
      p.supplier ?? "",
      p.reference ?? "",
      p.recordedBy?.name ?? "",
      p.voidedAt ? "Yes" : "No",
      p.voidReason ?? "",
    ]),
  };
}
