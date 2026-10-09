import { Plus, Trash2, Wallet } from "lucide-react";
import type { ExpenseCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { addMonths, formatDate, formatMonth, monthStart, toISODate, today, todayISO } from "@/lib/dates";
import { formatMoney, label, round2, toNumber } from "@/lib/format";
import { cn, sp } from "@/lib/utils";
import { DonutChart, SimpleBarChart } from "@/components/charts";
import { ConfirmAction, Dialog } from "@/components/ui/dialog";
import { Badge, Card, EmptyState, PageHeader, StatCard, Table, TD, TH, THead } from "@/components/ui/primitives";
import { KitchenTabs } from "../kitchen-tabs";
import { FilterBar, FilterField, filterControlClass } from "../filter-bar";
import { EXPENSE_CATEGORIES } from "../constants";
import { parseRange } from "../server-utils";
import { voidExpense } from "./actions";
import { ExpenseForm } from "./expense-form";

export const metadata = { title: "Kitchen expenses" };

const SERIES_BG = ["bg-series-1", "bg-series-2", "bg-series-3", "bg-series-4"] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission("expenses.view");
  const params = await searchParams;
  const { from, to } = parseRange(sp(params, "from"), sp(params, "to"));
  const categoryParam = sp(params, "category");
  const category = EXPENSE_CATEGORIES.includes(categoryParam as never) ? (categoryParam as ExpenseCategory) : undefined;
  const canRecord = can(user.role, "expenses.record");
  const canVoid = can(user.role, "expenses.void");

  const t = today();
  const chartFrom = addMonths(monthStart(t), -5);

  const [expenses, inRangeAll, sixMonths] = await Promise.all([
    db.kitchenExpense.findMany({
      where: { expenseDate: { gte: from, lte: to }, ...(category ? { category } : {}) },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      take: 500,
      include: { recordedBy: { select: { name: true } }, voidedBy: { select: { name: true } } },
    }),
    db.kitchenExpense.groupBy({
      by: ["category"],
      where: { expenseDate: { gte: from, lte: to }, voidedAt: null },
      _sum: { amount: true },
    }),
    db.kitchenExpense.findMany({
      where: { expenseDate: { gte: chartFrom, lte: t }, voidedAt: null },
      select: { expenseDate: true, amount: true },
    }),
  ]);

  const live = expenses.filter((e) => !e.voidedAt);
  const total = round2(live.reduce((a, e) => a + toNumber(e.amount), 0));

  // Category breakdown over the date range (all categories). Top 3 + "Others" keeps the donut to 4 series colours.
  const byCategory = inRangeAll
    .map((g) => ({ category: g.category, value: round2(toNumber(g._sum.amount)) }))
    .filter((g) => g.value > 0)
    .sort((a, b) => b.value - a.value);
  const rangeTotal = round2(byCategory.reduce((a, g) => a + g.value, 0));
  const top = byCategory.slice(0, byCategory.length > 4 ? 3 : 4);
  const rest = byCategory.slice(top.length);
  const donut = [
    ...top.map((g) => ({ name: label(g.category), value: g.value })),
    ...(rest.length ? [{ name: "Others", value: round2(rest.reduce((a, g) => a + g.value, 0)) }] : []),
  ];
  const colorFor = (cat: string) => {
    const i = top.findIndex((g) => g.category === cat);
    // Same index order DonutChart uses for its default series colours.
    return SERIES_BG[i >= 0 ? i : 3];
  };

  const months = Array.from({ length: 6 }, (_, i) => addMonths(chartFrom, i));
  const monthly = months.map((m) => ({
    month: formatMonth(m),
    total: round2(
      sixMonths
        .filter((e) => e.expenseDate.getUTCFullYear() === m.getUTCFullYear() && e.expenseDate.getUTCMonth() === m.getUTCMonth())
        .reduce((a, e) => a + toNumber(e.amount), 0),
    ),
  }));
  const thisMonth = monthly[monthly.length - 1]!.total;
  const lastMonth = monthly[monthly.length - 2]!.total;

  const fromISO = toISODate(from);
  const toISO = toISODate(to);
  const tISO = todayISO();

  return (
    <div>
      <KitchenTabs role={user.role} />
      <PageHeader
        title="Kitchen expenses"
        description="Gas, water, cleaning supplies, transport and other kitchen running costs."
        actions={
          canRecord ? (
            <Dialog trigger={<><Plus className="h-4 w-4" /> Record expense</>} triggerVariant="primary" title="Record kitchen expense" wide>
              <ExpenseForm todayISO={tISO} />
            </Dialog>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 @xl:grid-cols-3">
        <StatCard
          label={category ? `${label(category)} in period` : "Total in period"}
          value={formatMoney(total)}
          hint={`${formatDate(from)} – ${formatDate(to)}`}
          icon={<Wallet className="h-4 w-4" />}
          tone="accent"
        />
        <StatCard label="This month" value={formatMoney(thisMonth)} hint={`${formatMonth(t, "long")} to date`} />
        <StatCard label="Last month" value={formatMoney(lastMonth)} hint={formatMonth(addMonths(monthStart(t), -1), "long")} />
      </div>

      <div className="mb-5 grid gap-5 @4xl:grid-cols-5">
        <Card title="By category" subtitle={`${formatDate(from)} – ${formatDate(to)}`} className="@4xl:col-span-2">
          {byCategory.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-3">No expenses in this period.</p>
          ) : (
            <div className="grid items-center gap-4 @xl:grid-cols-2 @4xl:grid-cols-1 @6xl:grid-cols-2">
              <DonutChart data={donut} kind="money" height={190} />
              <ul className="space-y-2 text-sm">
                {byCategory.map((g) => (
                  <li key={g.category} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-ink-2">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", colorFor(g.category))} />
                      <span className="truncate">{label(g.category)}</span>
                    </span>
                    <span className="flex items-center gap-2 tabular">
                      <span className="text-ink">{formatMoney(g.value)}</span>
                      <span className="w-9 text-right text-xs text-ink-3">{rangeTotal ? Math.round((g.value / rangeTotal) * 100) : 0}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card title="By month" subtitle="Last 6 months, all categories" className="@4xl:col-span-3">
          <SimpleBarChart data={monthly} xKey="month" series={[{ key: "total", label: "Expenses" }]} kind="money" height={220} />
        </Card>
      </div>

      <Card>
        <FilterBar resetHref="/kitchen/expenses">
          <FilterField label="From">
            <input type="date" name="from" defaultValue={fromISO} max={tISO} className={filterControlClass} />
          </FilterField>
          <FilterField label="To">
            <input type="date" name="to" defaultValue={toISO} max={tISO} className={filterControlClass} />
          </FilterField>
          <FilterField label="Category">
            <select name="category" defaultValue={category ?? ""} className={filterControlClass}>
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </select>
          </FilterField>
        </FilterBar>

        {expenses.length === 0 ? (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="No expenses in this period" description="Change the filters or record a new expense." />
        ) : (
          <Table className="[&_table]:min-w-205">
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Description</TH>
                <TH>Category</TH>
                <TH align="right">Amount</TH>
                <TH>Paid via</TH>
                <TH>Reference</TH>
                <TH>Recorded by</TH>
                {canVoid && (
                  <TH align="right">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </tr>
            </THead>
            <tbody>
              {expenses.map((e) => {
                const voided = !!e.voidedAt;
                const strike = voided ? "line-through text-ink-3" : undefined;
                return (
                  <tr key={e.id}>
                    <TD className="whitespace-nowrap">
                      <span className={strike}>{formatDate(e.expenseDate)}</span>
                    </TD>
                    <TD>
                      <span className={cn("font-medium", strike)}>{e.description}</span>
                      {e.notes && !voided && <div className="mt-0.5 text-xs text-ink-3">{e.notes}</div>}
                      {voided && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                          <Badge tone="bad">Voided</Badge>
                          {e.voidReason}
                          {e.voidedBy && <span>· {e.voidedBy.name}</span>}
                        </div>
                      )}
                    </TD>
                    <TD className={cn("whitespace-nowrap text-ink-2", strike)}>{label(e.category)}</TD>
                    <TD align="right" className={cn("whitespace-nowrap font-medium", strike)}>{formatMoney(e.amount)}</TD>
                    <TD className="text-ink-2">{label(e.paymentMethod)}</TD>
                    <TD className="text-ink-2">{e.reference ?? "—"}</TD>
                    <TD className="whitespace-nowrap text-ink-2">{e.recordedBy?.name ?? "—"}</TD>
                    {canVoid && (
                      <TD align="right">
                        {!voided && (
                          <ConfirmAction
                            action={voidExpense}
                            payload={{ id: e.id }}
                            label={<Trash2 className="h-4 w-4" />}
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Void this expense?"
                            message={`"${e.description}" (${formatMoney(e.amount)}) will be excluded from totals. It stays in the list for the record.`}
                            requireReason="Reason for voiding"
                            confirmLabel="Void expense"
                            confirmVariant="danger"
                          />
                        )}
                      </TD>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="pt-3 text-xs font-medium uppercase tracking-wide text-ink-3">
                  Total ({live.length} expense{live.length === 1 ? "" : "s"})
                </td>
                <td className="tabular px-3 pt-3 text-right font-semibold text-ink">{formatMoney(total)}</td>
                <td colSpan={canVoid ? 4 : 3} />
              </tr>
            </tfoot>
          </Table>
        )}
      </Card>
    </div>
  );
}
