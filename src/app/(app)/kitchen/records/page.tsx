import Link from "next/link";
import { ClipboardList, Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { MEAL_LABEL } from "@/lib/meals";
import { addDays, diffDays, formatDate, formatDayShort, parseDateOnly, toISODate, today } from "@/lib/dates";
import { formatNumber, round2, toNumber } from "@/lib/format";
import { sp } from "@/lib/utils";
import { Legend, SimpleBarChart } from "@/components/charts";
import { Badge, Callout, Card, EmptyState, PageHeader, StatCard, Table, TD, TH, THead } from "@/components/ui/primitives";

export const metadata = { title: "Meal records" };

const MAX_RANGE_DAYS = 366;

function parseDateParam(v: string | undefined): Date | null {
  if (!v) return null;
  try {
    return parseDateOnly(v);
  } catch {
    return null;
  }
}

export default async function MealRecordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("meals.record");
  const params = await searchParams;
  const now = today();
  let to = parseDateParam(sp(params, "to")) ?? now;
  let from = parseDateParam(sp(params, "from")) ?? addDays(to, -29);
  if (from.getTime() > to.getTime()) [from, to] = [to, from];
  const clamped = diffDays(from, to) + 1 > MAX_RANGE_DAYS;
  if (clamped) from = addDays(to, -(MAX_RANGE_DAYS - 1));

  const meals = await db.meal.findMany({
    where: { date: { gte: from, lte: to }, record: { isNot: null } },
    orderBy: [{ date: "desc" }, { type: "asc" }],
    include: {
      record: { include: { recordedBy: { select: { name: true } } } },
      attendances: { select: { attended: true } },
    },
  });

  const rows = meals.map((m) => {
    const r = m.record!;
    const tracked = m.attendances.length > 0;
    const attended = m.attendances.filter((a) => a.attended).length;
    return {
      id: m.id,
      date: m.date,
      type: m.type,
      menu: m.menu,
      expected: r.expectedCount,
      served: r.servedCount,
      leftovers: toNumber(r.leftoverPortions),
      tracked,
      attended,
      absent: tracked ? Math.max(0, r.expectedCount - attended) : null,
      recordedBy: r.recordedBy?.name ?? "—",
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({ expected: acc.expected + r.expected, served: acc.served + r.served, leftovers: round2(acc.leftovers + r.leftovers) }),
    { expected: 0, served: 0, leftovers: 0 },
  );

  // Per-day chart (oldest → newest), only days with a recorded meal.
  const byDay = new Map<string, { day: string; served: number; expected: number }>();
  for (const r of [...rows].reverse()) {
    const key = toISODate(r.date);
    const entry = byDay.get(key) ?? { day: formatDayShort(r.date), served: 0, expected: 0 };
    entry.served += r.served;
    entry.expected += r.expected;
    byDay.set(key, entry);
  }
  const chartData = [...byDay.values()];
  const servedRate = totals.expected > 0 ? Math.round((totals.served / totals.expected) * 100) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Meal records"
        description={`${formatDate(from)} – ${formatDate(to)}`}
        actions={
          <form method="get" action="/kitchen/records" className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-ink-2">
              <span className="mb-1 block">From</span>
              <input
                type="date"
                name="from"
                defaultValue={toISODate(from)}
                className="h-10 rounded-xl border border-line-2 bg-card-2 px-3 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </label>
            <label className="text-xs text-ink-2">
              <span className="mb-1 block">To</span>
              <input
                type="date"
                name="to"
                defaultValue={toISODate(to)}
                className="h-10 rounded-xl border border-line-2 bg-card-2 px-3 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </label>
            <button type="submit" className="h-10 rounded-full bg-accent px-4 text-sm font-medium text-accent-ink hover:bg-accent-hover">
              Apply
            </button>
          </form>
        }
      />

      {clamped && <Callout tone="warn">Showing the most recent {MAX_RANGE_DAYS} days of the selected range.</Callout>}

      <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-4">
        <StatCard label="Meals recorded" value={rows.length} />
        <StatCard label="Meals served" value={formatNumber(totals.served)} tone="good" />
        <StatCard label="Served vs expected" value={servedRate === null ? "—" : `${servedRate}%`} hint={`${formatNumber(totals.expected)} expected`} />
        <StatCard label="Leftover portions" value={formatNumber(totals.leftovers)} tone="warn" />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" />}
            title="No meals recorded in this period"
            description="Record served counts from Today's Meals after each meal (breakfast, dinner, and lunch at weekends)."
          />
        </Card>
      ) : (
        <>
          <Card
            title="Served vs expected"
            subtitle="Per day, all meals combined"
            action={
              <Legend
                series={[
                  { key: "expected", label: "Expected" },
                  { key: "served", label: "Served" },
                ]}
              />
            }
          >
            <SimpleBarChart
              data={chartData}
              xKey="day"
              kind="number"
              series={[
                { key: "expected", label: "Expected" },
                { key: "served", label: "Served" },
              ]}
            />
          </Card>

          <Card title="History" subtitle={`${rows.length} recorded meal${rows.length === 1 ? "" : "s"}`}>
            <Table className="[&_table]:min-w-215">
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Meal</TH>
                  <TH>Menu</TH>
                  <TH align="right">Expected</TH>
                  <TH align="right">Served</TH>
                  <TH align="right">Attended</TH>
                  <TH align="right">Absent</TH>
                  <TH align="right">Leftovers</TH>
                  <TH>Recorded by</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <TD className="whitespace-nowrap">{formatDayShort(r.date)}</TD>
                    <TD>
                      <Badge tone={r.type === "BREAKFAST" ? "info" : r.type === "LUNCH" ? "warn" : "accent"}>{MEAL_LABEL[r.type]}</Badge>
                    </TD>
                    <TD className="max-w-60 truncate text-ink-2">
                      <span title={r.menu}>{r.menu}</span>
                    </TD>
                    <TD align="right">{r.expected}</TD>
                    <TD align="right" className="font-medium">{r.served}</TD>
                    <TD align="right">{r.tracked ? r.attended : <span className="text-ink-3">—</span>}</TD>
                    <TD align="right">{r.absent === null ? <span className="text-ink-3">—</span> : r.absent}</TD>
                    <TD align="right">{formatNumber(r.leftovers)}</TD>
                    <TD className="whitespace-nowrap text-ink-2">{r.recordedBy}</TD>
                    <TD align="right">
                      <Link
                        href={`/kitchen/today?date=${toISODate(r.date)}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-ink-2 hover:bg-card-2 hover:text-ink"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Link>
                    </TD>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="px-3 pt-3 pl-0 text-xs font-medium uppercase tracking-wide text-ink-3">
                    Totals
                  </td>
                  <td className="tabular px-3 pt-3 text-right font-medium text-ink">{formatNumber(totals.expected)}</td>
                  <td className="tabular px-3 pt-3 text-right font-semibold text-ink">{formatNumber(totals.served)}</td>
                  <td colSpan={2} />
                  <td className="tabular px-3 pt-3 text-right font-semibold text-ink">{formatNumber(totals.leftovers)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
