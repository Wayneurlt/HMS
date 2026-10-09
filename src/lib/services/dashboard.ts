import "server-only";
import { db } from "@/lib/db";
import { addMonths, formatMonth, monthEnd, monthStart, monthsBetween, toISODate, today as todayFn } from "@/lib/dates";
import { round2, toNumber } from "@/lib/format";
import { mealExpectation, nightSummary } from "./attendance";
import { stockAlerts } from "./inventory";
import { rentTotals } from "./rent";

export type DashboardRange = "6m" | "12m" | "ytd";

/** All figures for the owner/manager dashboard, computed from the database. */
export async function getDashboardData(opts: { range: DashboardRange; includeFinance: boolean }) {
  const today = todayFn();
  const mStart = monthStart(today);
  const mEnd = monthEnd(today);

  const rangeStart =
    opts.range === "ytd"
      ? new Date(Date.UTC(today.getUTCFullYear(), 0, 1))
      : addMonths(mStart, opts.range === "6m" ? -5 : -11);

  const [beds, rentMonth, outstandingAll, tonight, breakfast, dinner, alerts, pendingRequests, payments, invoices, recentPayments, currentInvoices] =
    await Promise.all([
      db.bed.groupBy({
        by: ["status"],
        where: { deletedAt: null, room: { deletedAt: null } },
        _count: { _all: true },
      }),
      rentTotals(mStart, mEnd),
      db.rentInvoice.aggregate({
        where: { voidedAt: null, status: { not: "PAID" } },
        _sum: { amountDue: true, amountPaid: true },
      }),
      nightSummary(today),
      mealExpectation(today, "BREAKFAST"),
      mealExpectation(today, "DINNER"),
      stockAlerts(),
      db.shoppingRequest.count({ where: { status: "PENDING" } }),
      db.rentPayment.findMany({
        where: { voidedAt: null, paidAt: { gte: rangeStart, lte: mEnd } },
        select: { amount: true, paidAt: true },
      }),
      db.rentInvoice.findMany({
        where: { voidedAt: null, periodMonth: { gte: rangeStart, lte: mEnd } },
        select: { amountDue: true, amountPaid: true, periodMonth: true },
      }),
      db.rentPayment.findMany({
        where: { voidedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, amount: true, method: true, createdAt: true, invoiceId: true, student: { select: { fullName: true } } },
      }),
      db.rentInvoice.findMany({
        where: { voidedAt: null, periodMonth: mStart },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
        select: {
          id: true,
          amountDue: true,
          amountPaid: true,
          dueDate: true,
          status: true,
          student: { select: { id: true, fullName: true } },
        },
      }),
    ]);

  const bedCount = (s: string) => beds.find((b) => b.status === s)?._count._all ?? 0;
  const totalBeds = beds.reduce((a, b) => a + b._count._all, 0);
  const occupied = bedCount("OCCUPIED");

  // Monthly series
  const months = monthsBetween(rangeStart, mStart);
  const key = (d: Date) => toISODate(monthStart(d));
  const collectedBy = new Map<string, number>();
  for (const p of payments) collectedBy.set(key(p.paidAt), (collectedBy.get(key(p.paidAt)) ?? 0) + toNumber(p.amount));
  const outstandingBy = new Map<string, number>();
  for (const i of invoices) {
    const o = toNumber(i.amountDue) - toNumber(i.amountPaid);
    outstandingBy.set(key(i.periodMonth), (outstandingBy.get(key(i.periodMonth)) ?? 0) + Math.max(0, o));
  }
  const rentSeries = months.map((m) => ({
    month: formatMonth(m).split(" ")[0]!,
    collected: round2(collectedBy.get(toISODate(m)) ?? 0),
    outstanding: round2(outstandingBy.get(toISODate(m)) ?? 0),
  }));

  // Kitchen spend this month (owner only)
  let kitchen: { foodSpend: number; byCategory: { name: string; value: number }[] } | null = null;
  if (opts.includeFinance) {
    const [purchases, expenses] = await Promise.all([
      db.purchase.aggregate({ where: { voidedAt: null, purchaseDate: { gte: mStart, lte: mEnd } }, _sum: { totalCost: true } }),
      db.kitchenExpense.groupBy({
        by: ["category"],
        where: { voidedAt: null, expenseDate: { gte: mStart, lte: mEnd } },
        _sum: { amount: true },
      }),
    ]);
    const purchaseTotal = round2(toNumber(purchases._sum.totalCost));
    const exp = (c: string) => round2(toNumber(expenses.find((e) => e.category === c)?._sum.amount));
    const otherTotal = round2(
      expenses.filter((e) => !["FOOD", "GAS"].includes(e.category)).reduce((a, e) => a + toNumber(e._sum.amount), 0),
    );
    kitchen = {
      foodSpend: round2(purchaseTotal + exp("FOOD")),
      // Fixed entity → colour order: Food purchases, Food (other), Gas, Other kitchen
      byCategory: [
        { name: "Stock purchases", value: purchaseTotal },
        { name: "Food (other)", value: exp("FOOD") },
        { name: "Gas", value: exp("GAS") },
        { name: "Other kitchen", value: otherTotal },
      ],
    };
  }

  return {
    today,
    beds: {
      total: totalBeds,
      occupied,
      available: bedCount("AVAILABLE"),
      reserved: bedCount("RESERVED"),
      maintenance: bedCount("MAINTENANCE"),
      rate: totalBeds ? Math.round((occupied / totalBeds) * 100) : 0,
    },
    rent: {
      ...rentMonth,
      outstandingAll: round2(toNumber(outstandingAll._sum.amountDue) - toNumber(outstandingAll._sum.amountPaid)),
      series: rentSeries,
      rangeCollected: round2(rentSeries.reduce((a, r) => a + r.collected, 0)),
    },
    tonight,
    breakfast,
    dinner,
    alerts,
    pendingRequests,
    recentPayments: recentPayments.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      name: p.student.fullName,
      amount: toNumber(p.amount),
      method: p.method,
      createdAt: p.createdAt,
    })),
    currentInvoices: currentInvoices.map((i) => ({
      id: i.id,
      studentId: i.student.id,
      name: i.student.fullName,
      due: toNumber(i.amountDue),
      paid: toNumber(i.amountPaid),
      dueDate: i.dueDate,
      status: i.status,
    })),
    kitchen,
  };
}
