import Link from "next/link";
import {
  BedDouble,
  CalendarRange,
  ChefHat,
  Download,
  Moon,
  Users,
  Wallet,
} from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDate, toISODate } from "@/lib/dates";
import { formatMoney, formatNumber, formatPercent, label } from "@/lib/format";
import { sp } from "@/lib/utils";
import { DonutChart, Legend, SimpleBarChart } from "@/components/charts";
import { Input, Select } from "@/components/ui/form";
import { Card, EmptyState, FilterTabs, LinkButton, PageHeader, StatCard, Table, TD, TH, THead } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import {
  EXPENSE_CATEGORIES,
  kitchenReport,
  occupancyReport,
  parseCategory,
  parseRange,
  presetRange,
  rentReport,
  studentsReport,
  type ReportRange,
} from "./data";
import { PrintButton } from "./print-button";

export const metadata = { title: "Reports" };

/** Same validated order as SERIES in components/charts (a client module, so not importable as a value here). */
const PALETTE = ["#8b7cf6", "#2fa898", "#c07c2a", "#c85fbb"] as const;

type SearchParams =Promise<Record<string, string | string[] | undefined>>;

function qs(range: { from: Date; to: Date }, extra: Record<string, string | null | undefined> = {}) {
  const p = new URLSearchParams({ from: toISODate(range.from), to: toISODate(range.to) });
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return p.toString();
}

function ExportLink({ type, range, extra, label: text = "Export CSV" }: { type: string; range: ReportRange; extra?: Record<string, string | null>; label?: string }) {
  return (
    <LinkButton href={`/api/reports/${type}?${qs(range, extra)}`} prefetch={false} size="sm" variant="outline" className="no-print">
      <Download className="h-3.5 w-3.5" /> {text}
    </LinkButton>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission("reports.operational");
  const params = await searchParams;
  const range = parseRange({ from: sp(params, "from"), to: sp(params, "to") });
  const showKitchen = can(user.role, "reports.kitchen");
  const category = showKitchen ? parseCategory(sp(params, "category")) : null;

  const [occupancy, rent, students, kitchen] = await Promise.all([
    occupancyReport(range),
    rentReport(range),
    studentsReport(range),
    showKitchen ? kitchenReport(range, category) : Promise.resolve(null),
  ]);

  // Donut: top 3 categories + "Other" so colours come from the 4-colour series without cycling.
  const sortedCats = [...(kitchen?.byCategory ?? [])].sort((a, b) => b.value - a.value);
  const donutRows =
    sortedCats.length > 4
      ? [
          ...sortedCats.slice(0, 3).map((c) => ({ name: label(c.name), value: c.value })),
          { name: "Other categories", value: sortedCats.slice(3).reduce((a, c) => a + c.value, 0) },
        ]
      : sortedCats.map((c) => ({ name: label(c.name), value: c.value }));
  const donut = donutRows.map((d, i) => ({ ...d, color: PALETTE[i]! }));

  const presets = [
    { value: "this-month", label: "This month" },
    { value: "last-month", label: "Last month" },
    { value: "last-3-months", label: "Last 3 months" },
    { value: "this-year", label: "This year" },
  ] as const;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description={
          <>
            {formatDate(range.from)} – {formatDate(range.to)}
            {category && <> · expenses filtered to {label(category)}</>}
          </>
        }
        actions={<PrintButton />}
      />

      {/* Filters */}
      <Card className="no-print" bodyClassName="space-y-4">
        <FilterTabs
          active={range.preset}
          tabs={presets.map((p) => ({
            value: p.value,
            label: p.label,
            href: `/reports?${qs(presetRange(p.value), { category })}`,
          }))}
        />
        <form method="get" action="/reports" className="flex flex-wrap items-end gap-3">
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-ink-2">From</span>
            <Input name="from" type="date" defaultValue={toISODate(range.from)} className="w-auto" />
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-ink-2">To</span>
            <Input name="to" type="date" defaultValue={toISODate(range.to)} className="w-auto" />
          </label>
          {showKitchen && (
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-ink-2">Expense category</span>
              <Select
                name="category"
                defaultValue={category ?? ""}
                placeholder="All categories"
                options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: label(c) }))}
                className="w-auto min-w-44"
              />
            </label>
          )}
          <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-accent-ink hover:bg-accent-hover">
            <CalendarRange className="h-4 w-4" /> Apply
          </button>
          {(range.preset !== "this-month" || category) && (
            <Link href="/reports" className="inline-flex h-10 items-center px-2 text-sm text-ink-2 hover:text-ink">
              Reset
            </Link>
          )}
        </form>
      </Card>

      {/* Occupancy */}
      <Card
        title="Occupancy"
        subtitle="Beds right now, and average occupancy over the period (nights up to today)"
        action={<ExportLink type="occupancy" range={range} />}
      >
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @6xl:grid-cols-6">
          <StatCard label="Total beds" value={formatNumber(occupancy.totalBeds)} icon={<BedDouble className="h-3.5 w-3.5" />} />
          <StatCard label="Occupied" value={formatNumber(occupancy.occupied)} tone="accent" />
          <StatCard label="Vacant" value={formatNumber(occupancy.vacant)} tone="good" />
          <StatCard label="Reserved" value={formatNumber(occupancy.reserved)} />
          <StatCard label="Maintenance" value={formatNumber(occupancy.maintenance)} />
          <StatCard
            label="Occupancy rate"
            value={formatPercent(occupancy.occupancyRate)}
            hint={occupancy.averageRate === null ? "Period average —" : `Period average ${formatPercent(occupancy.averageRate, 1)}`}
          />
        </div>
        {occupancy.months.length > 1 || occupancy.nights > 0 ? (
          <div className="mt-5">
            <p className="mb-2 text-xs text-ink-3">Average occupancy by month (%)</p>
            <SimpleBarChart data={occupancy.months} xKey="month" kind="number" series={[{ key: "rate", label: "Occupancy %" }]} height={200} />
          </div>
        ) : null}
      </Card>

      {/* Rent */}
      <Card
        title="Rent"
        subtitle="Expected = rent months in the period · Collected = payments received in the period"
        action={
          <>
            <ExportLink type="payments" range={range} label="Payments CSV" />
            <ExportLink type="rent" range={range} label="Rent CSV" />
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @6xl:grid-cols-6">
          <StatCard label="Expected" value={formatMoney(rent.totals.expected)} icon={<Wallet className="h-3.5 w-3.5" />} />
          <StatCard label="Collected" value={formatMoney(rent.totals.collected)} tone="good" />
          <StatCard label="Outstanding" value={formatMoney(rent.totals.outstanding)} tone={rent.totals.outstanding > 0 ? "warn" : "neutral"} />
          <StatCard label="Paid students" value={formatNumber(rent.studentCounts.PAID)} />
          <StatCard label="Partially paid" value={formatNumber(rent.studentCounts.PARTIALLY_PAID)} hint={`${rent.studentCounts.PENDING} pending`} />
          <StatCard label="Overdue students" value={formatNumber(rent.studentCounts.OVERDUE)} tone={rent.studentCounts.OVERDUE ? "bad" : "neutral"} />
        </div>
        <div className="mt-5 grid gap-5 @[100rem]:grid-cols-5">
          <div className="@[100rem]:col-span-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs text-ink-3">Collected vs outstanding by month</p>
              <Legend series={[{ key: "collected", label: "Collected" }, { key: "outstanding", label: "Outstanding" }]} />
            </div>
            <SimpleBarChart
              data={rent.months}
              xKey="month"
              series={[
                { key: "collected", label: "Collected" },
                { key: "outstanding", label: "Outstanding" },
              ]}
              height={220}
            />
          </div>
          <div className="@[100rem]:col-span-3">
            {rent.students.length === 0 ? (
              <EmptyState icon={<Wallet className="h-5 w-5" />} title="No rent records in this period" description="Rent records are created monthly for checked-in students." />
            ) : (
              <div className="-mx-5 max-h-90 overflow-y-auto px-5">
                <Table>
                  <THead>
                    <tr>
                      <TH>Student</TH>
                      <TH align="right">Expected</TH>
                      <TH align="right">Paid</TH>
                      <TH align="right">Outstanding</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {rent.students.map((s) => (
                      <tr key={s.studentId}>
                        <TD>
                          <Link href={`/students/${s.studentId}`} className="hover:text-accent-hi">
                            {s.name}
                          </Link>
                        </TD>
                        <TD align="right">{formatMoney(s.expected)}</TD>
                        <TD align="right">{formatMoney(s.paid)}</TD>
                        <TD align="right" className={s.outstanding > 0 ? "text-warn" : undefined}>
                          {formatMoney(s.outstanding)}
                        </TD>
                        <TD>
                          <StatusBadge kind="rent" value={s.status} />
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Students */}
      <Card title="Students" subtitle="Bed changes are not counted as move-ins or check-outs" action={<ExportLink type="students" range={range} />}>
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @6xl:grid-cols-5">
          <StatCard label="Active now" value={formatNumber(students.active)} icon={<Users className="h-3.5 w-3.5" />} tone="accent" />
          <StatCard label="New in period" value={formatNumber(students.newStudents)} tone="good" />
          <StatCard label="Checked out in period" value={formatNumber(students.checkedOut)} />
          <StatCard
            label="Away tonight"
            value={formatNumber(students.awayTonight)}
            hint={`${students.residentsTonight} residents · ${students.notRespondedTonight} not responded`}
            icon={<Moon className="h-3.5 w-3.5" />}
          />
          <StatCard label="Pending applicants" value={formatNumber(students.pending)} hint={students.suspended ? `${students.suspended} suspended` : undefined} tone={students.pending ? "warn" : "neutral"} />
        </div>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-ink-3">Move-ins and check-outs by month</p>
            <Legend series={[{ key: "moveIns", label: "Move-ins" }, { key: "moveOuts", label: "Check-outs" }]} />
          </div>
          <SimpleBarChart
            data={students.months}
            xKey="month"
            kind="number"
            series={[
              { key: "moveIns", label: "Move-ins" },
              { key: "moveOuts", label: "Check-outs" },
            ]}
            height={200}
          />
        </div>
      </Card>

      {/* Kitchen (owner only) */}
      {kitchen && (
        <Card
          title="Kitchen"
          subtitle="Food cost = purchases + FOOD expenses · Cost per meal = food cost ÷ meals served"
          action={
            <>
              <ExportLink type="purchases" range={range} label="Purchases CSV" />
              <ExportLink type="expenses" range={range} extra={{ category }} label="Expenses CSV" />
              <ExportLink type="kitchen" range={range} extra={{ category }} label="Summary CSV" />
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @6xl:grid-cols-6">
            <StatCard label="Food expenditure" value={formatMoney(kitchen.foodCost)} icon={<ChefHat className="h-3.5 w-3.5" />} tone="accent" />
            <StatCard label="Kitchen expenditure" value={formatMoney(kitchen.kitchenTotal)} hint="Purchases + all expenses" />
            <StatCard label="Meals served" value={formatNumber(kitchen.mealsServed)} hint={`${kitchen.mealsRecorded} meals recorded`} />
            <StatCard label="Cost per meal" value={kitchen.costPerMeal === null ? "—" : formatMoney(kitchen.costPerMeal)} />
            <StatCard label="Food purchases" value={formatMoney(kitchen.purchasesTotal)} hint={`${kitchen.purchasesCount} purchase${kitchen.purchasesCount === 1 ? "" : "s"}`} />
            <StatCard label="Leftover portions" value={formatNumber(kitchen.leftovers)} />
          </div>

          <div className="mt-5 grid gap-5 @6xl:grid-cols-2">
            <div>
              <p className="mb-2 text-xs text-ink-3">
                Expenses by category{category ? ` (${label(category)})` : ""} · {kitchen.filteredExpensesCount} record
                {kitchen.filteredExpensesCount === 1 ? "" : "s"}
              </p>
              {kitchen.byCategory.length === 0 ? (
                <EmptyState title="No expenses in this period" />
              ) : (
                <div className="grid items-center gap-4 @xl:grid-cols-2">
                  <DonutChart data={donut} centerLabel="Expenses" height={200} />
                  <ul className="space-y-2 text-sm">
                    {donut.map((c) => (
                      <li key={c.name} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-ink-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                          {c.name}
                        </span>
                        <span className="tabular text-ink">{formatMoney(c.value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs text-ink-3">Spending by month</p>
                <Legend series={[{ key: "purchases", label: "Purchases" }, { key: "expenses", label: category ? label(category) : "Expenses" }]} />
              </div>
              <SimpleBarChart
                data={kitchen.months}
                xKey="month"
                stacked
                series={[
                  { key: "purchases", label: "Purchases" },
                  { key: "expenses", label: category ? label(category) : "Expenses" },
                ]}
                height={220}
              />
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs text-ink-3">Stock usage (consumption and waste)</p>
            {kitchen.usage.length === 0 ? (
              <EmptyState title="No stock used in this period" description="Consumption and waste are recorded from the stock page." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Item</TH>
                    <TH align="right">Used</TH>
                    <TH align="right">Wasted</TH>
                    <TH>Unit</TH>
                  </tr>
                </THead>
                <tbody>
                  {kitchen.usage.slice(0, 15).map((u) => (
                    <tr key={u.item}>
                      <TD>{u.item}</TD>
                      <TD align="right">{formatNumber(u.consumed, 3)}</TD>
                      <TD align="right" className={u.wasted > 0 ? "text-warn" : "text-ink-3"}>
                        {formatNumber(u.wasted, 3)}
                      </TD>
                      <TD className="text-ink-2">{u.unit}</TD>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
