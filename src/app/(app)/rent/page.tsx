import Link from "next/link";
import type { Prisma, RentStatus } from "@prisma/client";
import { AlertTriangle, BellRing, CircleDollarSign, FilePlus2, Plus, Receipt, Search, Wallet, X } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { addMonths, formatDate, formatMonth, monthEnd, monthStart, today, toISODate } from "@/lib/dates";
import { formatMoney, round2, toNumber } from "@/lib/format";
import { outstandingByStudent, outstandingOf, rentTotals, syncRentStatuses } from "@/lib/services/rent";
import { sp } from "@/lib/utils";
import { SimpleBarChart } from "@/components/charts";
import { ConfirmAction, Dialog } from "@/components/ui/dialog";
import {
  Avatar,
  Card,
  EmptyState,
  FilterTabs,
  LinkButton,
  PageHeader,
  StatCard,
  Table,
  TD,
  TH,
  THead,
} from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { generateInvoicesAction } from "./actions";
import { MonthPicker } from "./controls";
import { RecordPaymentForm, type PayableInvoice } from "./payment-form";

export const metadata = { title: "Rent" };

const STATUS_TABS: { value: "ALL" | RentStatus; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "PARTIALLY_PAID", label: "Partially paid" },
  { value: "PENDING", label: "Pending" },
  { value: "PAID", label: "Paid" },
];
const ROW_LIMIT = 200;

function parseMonth(v: string | undefined, fallback: Date): Date {
  if (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return new Date(`${v}-01T00:00:00.000Z`);
  return fallback;
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RentPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission("rent.view");
  await syncRentStatuses();
  const params = await searchParams;

  const todayD = today();
  const currentMonth = monthStart(todayD);
  const month = parseMonth(sp(params, "month"), currentMonth);
  const monthKey = toISODate(month).slice(0, 7);
  const statusParam = sp(params, "status")?.toUpperCase();
  const status = STATUS_TABS.some((t) => t.value === statusParam) ? (statusParam as "ALL" | RentStatus) : "ALL";
  const studentId = sp(params, "student")?.slice(0, 64) || undefined;
  const q = sp(params, "q")?.trim().slice(0, 80) || undefined;
  const showVoided = sp(params, "voided") === "1";
  const scope = sp(params, "scope") === "all" || sp(params, "scope") === "month" ? sp(params, "scope")! : studentId ? "all" : "month";
  const canManage = can(user.role, "rent.manage");

  const href = (patch: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = {
      month: sp(params, "month") ? monthKey : undefined,
      status: status === "ALL" ? undefined : status,
      student: studentId,
      q,
      voided: showVoided ? "1" : undefined,
      scope: sp(params, "scope"),
      ...patch,
    };
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(base)) if (v) s.set(k, v);
    const qs = s.toString();
    return qs ? `/rent?${qs}` : "/rent";
  };

  // ── Filters for the invoice table ──
  const baseWhere: Prisma.RentInvoiceWhereInput = {
    ...(scope === "month" ? { periodMonth: month } : {}),
    ...(studentId ? { studentId } : {}),
    ...(q ? { student: { fullName: { contains: q, mode: "insensitive" } } } : {}),
  };
  const tableWhere: Prisma.RentInvoiceWhereInput = {
    ...baseWhere,
    ...(showVoided ? {} : { voidedAt: null }),
    ...(status === "ALL" ? {} : { status, voidedAt: null }),
  };

  // ── Chart months: 6 months ending at the selected month ──
  const chartMonths = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));

  const [totals, outstandingMap, statusGroups, invoices, filterStudent, unpaid, chartTotals] = await Promise.all([
    rentTotals(month, monthEnd(month)),
    outstandingByStudent(),
    db.rentInvoice.groupBy({ by: ["status"], where: { ...baseWhere, voidedAt: null }, _count: { _all: true } }),
    db.rentInvoice.findMany({
      where: tableWhere,
      orderBy: [{ periodMonth: "desc" }, { dueDate: "asc" }, { student: { fullName: "asc" } }],
      take: ROW_LIMIT + 1,
      include: { student: { select: { id: true, fullName: true } } },
    }),
    studentId ? db.student.findUnique({ where: { id: studentId }, select: { id: true, fullName: true } }) : null,
    canManage
      ? db.rentInvoice.findMany({
          where: { voidedAt: null, status: { not: "PAID" } },
          orderBy: [{ periodMonth: "asc" }],
          include: { student: { select: { id: true, fullName: true } } },
        })
      : [],
    Promise.all(chartMonths.map((m) => rentTotals(m, monthEnd(m)))),
  ]);

  const statusCounts = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])) as Partial<Record<RentStatus, number>>;
  const allCount = Object.values(statusCounts).reduce((a, b) => a + (b ?? 0), 0);
  const totalOutstanding = round2([...outstandingMap.values()].reduce((a, b) => a + (b > 0 ? b : 0), 0));

  const owing = [...outstandingMap.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const owingStudents = owing.length
    ? await db.student.findMany({ where: { id: { in: owing.map(([id]) => id) } }, select: { id: true, fullName: true, status: true } })
    : [];
  const studentById = new Map(owingStudents.map((s) => [s.id, s]));

  const payable: PayableInvoice[] = unpaid
    .map((i) => ({
      id: i.id,
      studentId: i.student.id,
      studentName: i.student.fullName,
      monthLabel: formatMonth(i.periodMonth, "long"),
      dueDate: toISODate(i.dueDate),
      amountDue: toNumber(i.amountDue),
      amountPaid: toNumber(i.amountPaid),
      outstanding: outstandingOf(i),
    }))
    .filter((i) => i.outstanding > 0);
  const payableById = new Map(payable.map((p) => [p.id, p]));
  const todayISO = toISODate(todayD);

  const truncated = invoices.length > ROW_LIMIT;
  const rows = truncated ? invoices.slice(0, ROW_LIMIT) : invoices;

  const chartData = chartMonths.map((m, i) => ({
    month: formatMonth(m),
    collected: chartTotals[i]!.collected,
    outstanding: chartTotals[i]!.outstanding,
  }));

  const c = totals.statusCounts;
  const collectedPct = totals.expected > 0 ? Math.round((totals.paidAgainstPeriod / totals.expected) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Rent"
        description="Monthly rent records, payments and outstanding balances."
        actions={
          <>
            <MonthPicker value={monthKey} />
            <LinkButton href="/rent/reminders" variant="ghost">
              <BellRing className="h-4 w-4" /> Reminders
            </LinkButton>
            {canManage && (
              <ConfirmAction
                action={generateInvoicesAction}
                payload={{}}
                label={
                  <>
                    <FilePlus2 className="h-4 w-4" /> Generate invoices
                  </>
                }
                size="md"
                title="Generate rent records?"
                message={`Creates any missing rent records up to ${formatMonth(currentMonth, "long")} for every active stay. Existing records are left unchanged.`}
                confirmLabel="Generate"
              />
            )}
            {canManage && (
              <Dialog
                trigger={
                  <>
                    <Plus className="h-4 w-4" /> Record payment
                  </>
                }
                triggerVariant="primary"
                title="Record payment"
                description="Choose a student and the rent month being paid."
              >
                <RecordPaymentForm invoices={payable} today={todayISO} />
              </Dialog>
            )}
          </>
        }
      />

      {/* ── Summary tiles ── */}
      <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-4">
        <StatCard
          label={`Expected · ${formatMonth(month)}`}
          value={formatMoney(totals.expected)}
          hint={`${allCountFor(c)} rent record${allCountFor(c) === 1 ? "" : "s"}`}
          icon={<Receipt className="h-3.5 w-3.5" />}
          tone="accent"
        />
        <StatCard
          label={`Collected · ${formatMonth(month)}`}
          value={formatMoney(totals.collected)}
          hint="Payments received this month"
          icon={<Wallet className="h-3.5 w-3.5" />}
          tone="good"
        />
        <StatCard
          label={`Outstanding · ${formatMonth(month)}`}
          value={formatMoney(totals.outstanding)}
          hint={`${collectedPct}% of this month's rent paid`}
          icon={<CircleDollarSign className="h-3.5 w-3.5" />}
          tone="warn"
        />
        <StatCard
          label="Total outstanding"
          value={formatMoney(totalOutstanding)}
          hint={`${owing.length} student${owing.length === 1 ? "" : "s"} owing · all months`}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          tone="bad"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <CountChip n={c.PAID ?? 0} status="PAID" />
        <CountChip n={c.PARTIALLY_PAID ?? 0} status="PARTIALLY_PAID" />
        <CountChip n={c.PENDING ?? 0} status="PENDING" />
        <CountChip n={c.OVERDUE ?? 0} status="OVERDUE" />
      </div>

      <div className="mt-5 grid gap-5 @6xl:grid-cols-3">
        <Card title="Collections" subtitle={`Last 6 months to ${formatMonth(month, "long")}`} className="@6xl:col-span-2">
          <SimpleBarChart
            data={chartData}
            xKey="month"
            series={[
              { key: "collected", label: "Collected" },
              { key: "outstanding", label: "Outstanding" },
            ]}
            height={250}
          />
          <p className="mt-2 text-xs text-ink-3">
            Collected = payments received in the month. Outstanding = unpaid balance on that month&apos;s rent records.
          </p>
        </Card>

        <Card title="Outstanding balances" subtitle="All months, highest first">
          {owing.length === 0 ? (
            <EmptyState icon={<Wallet className="h-5 w-5" />} title="No balances" description="Every student is fully paid." />
          ) : (
            <ul className="max-h-75 divide-y divide-line/70 overflow-y-auto pr-1">
              {owing.map(([id, amount]) => {
                const s = studentById.get(id);
                const name = s?.fullName ?? "Unknown student";
                return (
                  <li key={id} className="flex items-center gap-3 py-2.5">
                    <Avatar name={name} size={30} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/students/${id}`} className="block truncate text-sm text-ink hover:text-accent-hi">
                        {name}
                      </Link>
                      <Link href={href({ student: id, status: undefined, scope: undefined, q: undefined })} className="text-xs text-ink-3 hover:text-ink-2">
                        View rent records
                      </Link>
                    </div>
                    <span className="tabular text-sm font-medium text-bad">{formatMoney(amount)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Invoice table ── */}
      <Card
        className="mt-5"
        title="Rent records"
        subtitle={scope === "month" ? formatMonth(month, "long") : "All months"}
        action={
          <div className="flex rounded-full bg-card-2 p-0.5 text-xs">
            <Link
              href={href({ scope: "month" })}
              className={`rounded-full px-3 py-1.5 ${scope === "month" ? "bg-card-3 text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {formatMonth(month)}
            </Link>
            <Link
              href={href({ scope: "all" })}
              className={`rounded-full px-3 py-1.5 ${scope === "all" ? "bg-card-3 text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              All months
            </Link>
          </div>
        }
      >
        <div className="mb-4 flex flex-col gap-3 @4xl:flex-row @4xl:items-center @4xl:justify-between">
          <FilterTabs
            active={status}
            tabs={STATUS_TABS.map((t) => ({
              value: t.value,
              label: t.label,
              href: href({ status: t.value === "ALL" ? undefined : t.value }),
              count: t.value === "ALL" ? allCount : (statusCounts[t.value] ?? 0),
            }))}
          />
          <div className="flex flex-wrap items-center gap-2">
            {filterStudent && (
              <Link
                href={href({ student: undefined })}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-lo px-3 text-xs font-medium text-accent-hi hover:opacity-90"
                title="Clear student filter"
              >
                {filterStudent.fullName} <X className="h-3.5 w-3.5" />
              </Link>
            )}
            <form action="/rent" method="get" className="relative">
              {sp(params, "month") && <input type="hidden" name="month" value={monthKey} />}
              {status !== "ALL" && <input type="hidden" name="status" value={status} />}
              {studentId && <input type="hidden" name="student" value={studentId} />}
              {showVoided && <input type="hidden" name="voided" value="1" />}
              {sp(params, "scope") && <input type="hidden" name="scope" value={scope} />}
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search student"
                aria-label="Search student"
                className="h-8 w-48 rounded-full border border-line-2 bg-card-2 pl-8 pr-3 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
              />
            </form>
            <Link
              href={href({ voided: showVoided ? undefined : "1" })}
              className="inline-flex h-8 items-center rounded-full px-3 text-xs text-ink-2 hover:bg-card-2 hover:text-ink"
            >
              {showVoided ? "Hide voided" : "Show voided"}
            </Link>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-5 w-5" />}
            title="No rent records found"
            description={
              q || studentId || status !== "ALL"
                ? "Try clearing the filters or choosing another month."
                : scope === "month"
                  ? "No rent records for this month yet. Use “Generate invoices” to create them for active stays."
                  : "Rent records are created when students are checked in."
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Student</TH>
                <TH>Month</TH>
                <TH align="right">Amount due</TH>
                <TH align="right">Paid</TH>
                <TH align="right">Outstanding</TH>
                <TH>Due date</TH>
                <TH>Status</TH>
                <TH align="right">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((inv) => {
                const voided = !!inv.voidedAt;
                const out = outstandingOf(inv);
                const pay = payableById.get(inv.id);
                return (
                  <tr key={inv.id} className={voided ? "opacity-60" : undefined}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={inv.student.fullName} size={28} />
                        <Link href={`/students/${inv.student.id}`} className="truncate hover:text-accent-hi">
                          {inv.student.fullName}
                        </Link>
                      </div>
                    </TD>
                    <TD>
                      <Link href={`/rent/${inv.id}`} className={`hover:text-accent-hi ${voided ? "line-through" : ""}`}>
                        {formatMonth(inv.periodMonth)}
                      </Link>
                    </TD>
                    <TD align="right" className={voided ? "line-through" : undefined}>
                      {formatMoney(inv.amountDue)}
                    </TD>
                    <TD align="right" className="text-ink-2">
                      {formatMoney(inv.amountPaid)}
                    </TD>
                    <TD align="right" className={voided ? "text-ink-3 line-through" : out > 0 ? "font-medium text-ink" : "text-ink-3"}>
                      {formatMoney(out)}
                    </TD>
                    <TD className="whitespace-nowrap text-ink-2">{formatDate(inv.dueDate)}</TD>
                    <TD>{voided ? <span className="text-xs text-ink-3">Voided</span> : <StatusBadge kind="rent" value={inv.status} />}</TD>
                    <TD align="right">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && pay && (
                          <Dialog trigger="Record payment" triggerSize="sm" title="Record payment" description={`${inv.student.fullName} · ${formatMonth(inv.periodMonth, "long")}`}>
                            <RecordPaymentForm invoices={[pay]} preselectedId={inv.id} today={todayISO} />
                          </Dialog>
                        )}
                        <LinkButton href={`/rent/${inv.id}`} variant="ghost" size="sm">
                          View
                        </LinkButton>
                      </div>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {truncated && <p className="mt-3 text-xs text-ink-3">Showing the first {ROW_LIMIT} records. Narrow the filters to see more.</p>}
      </Card>
    </div>
  );
}

function allCountFor(c: Partial<Record<RentStatus, number>>) {
  return (c.PAID ?? 0) + (c.PARTIALLY_PAID ?? 0) + (c.PENDING ?? 0) + (c.OVERDUE ?? 0);
}

function CountChip({ n, status }: { n: number; status: RentStatus }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5">
      <StatusBadge kind="rent" value={status} className="px-0 bg-transparent" />
      <span className="tabular font-medium text-ink">{n}</span>
    </span>
  );
}
