import { MasqaniLogo } from "@/components/brand/masqani-logo";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BedDouble,
  ChevronRight,
  ClipboardList,
  Coffee,
  Ellipsis,
  Moon,
  Package,
  Plus,
  Soup,
  UserCheck,
  Users,
  UserX,
  Wallet,
  Wifi,
} from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatDayLong, timeAgo } from "@/lib/dates";
import { formatMoney, label } from "@/lib/format";
import { getDashboardData, type DashboardRange } from "@/lib/services/dashboard";
import { runDailyJobsIfDue } from "@/lib/services/reminders";
import { DonutChart, Legend, SERIES, TrendAreaChart } from "@/components/charts";
import { Avatar, Badge, Card, EmptyState, LinkButton, Ring, SegmentedProgress, StatCard } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { RangeSelect } from "./range-select";

export const metadata = { title: "Dashboard" };

const RANGES: DashboardRange[] = ["ytd", "6m", "12m"];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requirePermission("dashboard.admin");
  const { range: rawRange } = await searchParams;
  const range: DashboardRange = RANGES.includes(rawRange as DashboardRange) ? (rawRange as DashboardRange) : "ytd";
  const finance = can(user.role, "dashboard.finance");

  // Daily rent job (invoice generation, overdue status, reminders) — at most once per day.
  await runDailyJobsIfDue();
  const d = await getDashboardData({ range, includeFinance: finance });

  const collectedPct = d.rent.expected > 0 ? Math.round((d.rent.paidAgainstPeriod / d.rent.expected) * 100) : 0;
  const tonightPct = d.tonight.residents > 0 ? Math.round((d.tonight.expected / d.tonight.residents) * 100) : 0;
  const stockAlertCount = d.alerts.low.length + d.alerts.out.length;
  const series = [
    { key: "collected", label: "Collected", color: SERIES[0] },
    { key: "outstanding", label: "Outstanding", color: SERIES[1] },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 @6xl:grid-cols-12">
      {/* ───────── Main column ───────── */}
      <div className="space-y-5 @6xl:col-span-9">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-ink">Dashboard</h1>
            <p className="mt-1 text-sm text-ink-2">
              {formatDayLong(d.today)} · residents, rent, meals and kitchen at a glance
            </p>
          </div>
          <LinkButton href="/students/new" variant="outline" className="h-11 self-start border-line bg-card px-5 sm:self-auto">
            <Plus className="h-4 w-4" /> Check in student
          </LinkButton>
        </div>

        {/* Row 1: rent balance + rent overview chart */}
        <div className="grid grid-cols-1 gap-5 @3xl:grid-cols-12">
          <Card className="@3xl:col-span-5 @7xl:col-span-4" bodyClassName="flex h-full flex-col">
            <div className="flex items-start justify-between">
              <h2 className="text-[15px] font-medium text-ink">Rent collected</h2>
              <span className="text-xs text-ink-3">This month</span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="tabular text-[32px] font-semibold tracking-tight text-ink">{formatMoney(d.rent.collected)}</span>
              <Badge tone={collectedPct >= 80 ? "good" : collectedPct >= 50 ? "warn" : "bad"}>
                {collectedPct}% <ArrowUpRight className="h-3 w-3" />
              </Badge>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <LinkButton href="/rent" className="h-11 whitespace-nowrap px-3">
                Payments
              </LinkButton>
              <LinkButton href="/rent?status=OVERDUE" variant="primary" className="h-11 whitespace-nowrap px-3">
                Overdue
              </LinkButton>
            </div>
            <div className="my-5 h-px bg-line" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-ink-2">Expected</p>
                <p className="tabular mt-1 text-xl font-semibold text-ink">{formatMoney(d.rent.expected)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-2">Outstanding</p>
                <p className={cn("tabular mt-1 text-xl font-semibold", d.rent.outstanding > 0 ? "text-ink" : "text-good")}>
                  {formatMoney(d.rent.outstanding)}
                </p>
              </div>
            </div>
            <SegmentedProgress value={collectedPct} className="mt-5" label="Share of this month's rent collected" />
            <div className="mt-2 flex items-center justify-between text-xs text-ink-2">
              <span>{formatMoney(d.rent.outstandingAll)} owed in total</span>
              <span className="tabular">{collectedPct}%</span>
            </div>
          </Card>

          <Card className="@3xl:col-span-7 @7xl:col-span-8">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-medium text-ink">Rent overview</h2>
                <p className="tabular mt-2 text-[32px] font-semibold tracking-tight text-ink">
                  {formatMoney(Math.floor(d.rent.rangeCollected), { decimals: false })}
                  <span className="text-ink-3">.00</span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <RangeSelect value={range} />
                <Legend series={series} />
              </div>
            </div>
            <div className="mt-2">
              <TrendAreaChart data={d.rent.series} xKey="month" series={series} height={210} />
            </div>
          </Card>
        </div>

        {/* Row 2: rent status per student + spend/occupancy donut */}
        <div className="grid grid-cols-1 gap-5 @3xl:grid-cols-12">
          <Card
            className="@3xl:col-span-7"
            title="Rent status this month"
            action={
              <Link href="/rent" className="grid h-8 w-8 place-items-center rounded-full border border-line-2 text-ink-2 hover:bg-card-2 hover:text-ink" aria-label="Open rent">
                <ChevronRight className="h-4 w-4" />
              </Link>
            }
          >
            {d.currentInvoices.length === 0 ? (
              <EmptyState icon={<Wallet className="h-5 w-5" />} title="No rent records this month" description="Rent is generated automatically for checked-in students." />
            ) : (
              <ul className="-my-1 max-h-75 divide-y divide-line overflow-y-auto pr-1">
                {d.currentInvoices.map((inv, i) => {
                  const pct = inv.due > 0 ? Math.min(100, Math.round((inv.paid / inv.due) * 100)) : 100;
                  return (
                    <li key={inv.id}>
                      <Link href={`/rent/${inv.id}`} className="flex items-center gap-3 py-3 hover:opacity-90">
                        <Ring value={pct} size={44} color={SERIES[i % 2 === 0 ? 0 : 1]} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{inv.name}</p>
                          <p className="whitespace-nowrap text-xs text-ink-3">Due: {formatDate(inv.dueDate)}</p>
                        </div>
                        <div className="hidden w-24 sm:block">
                          <p className="text-[11px] text-ink-3">Paid</p>
                          <p className="tabular text-sm font-semibold text-ink">{formatMoney(inv.paid)}</p>
                        </div>
                        <div className="w-28 text-right sm:text-left">
                          <p className="text-[11px] text-ink-3">Rent</p>
                          <p className="tabular text-sm font-semibold text-ink">{formatMoney(inv.due)}</p>
                        </div>
                        <StatusBadge kind="rent" value={inv.status} className="hidden @[86rem]:inline-flex" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {finance && d.kitchen ? (
            <Card
              className="@3xl:col-span-5"
              title="Kitchen spend"
              subtitle="This month"
              action={
                <Link href="/kitchen/expenses" className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-card-2 hover:text-ink" aria-label="Kitchen expenses">
                  <Ellipsis className="h-4 w-4" />
                </Link>
              }
            >
              <DonutChart data={d.kitchen.byCategory} centerLabel="Total" height={210} />
              <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-xs">
                {d.kitchen.byCategory.map((c, i) => (
                  <li key={c.name} className="flex items-center justify-between gap-2 text-ink-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: SERIES[i] }} />
                      {c.name}
                    </span>
                    <span className="tabular text-ink">{formatMoney(c.value)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card className="@3xl:col-span-5" title="Bed occupancy" subtitle="All rooms">
              <DonutChart
                kind="number"
                centerLabel="Beds"
                height={210}
                data={[
                  { name: "Occupied", value: d.beds.occupied },
                  { name: "Available", value: d.beds.available },
                  { name: "Reserved", value: d.beds.reserved },
                  { name: "Maintenance", value: d.beds.maintenance },
                ]}
              />
              <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {(["Occupied", "Available", "Reserved", "Maintenance"] as const).map((n, i) => (
                  <li key={n} className="flex items-center justify-between gap-2 text-ink-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: SERIES[i] }} />
                      {n}
                    </span>
                    <span className="tabular text-ink">
                      {[d.beds.occupied, d.beds.available, d.beds.reserved, d.beds.maintenance][i]}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Row 3: at a glance */}
        <div className="grid grid-cols-2 gap-4 @2xl:grid-cols-3 @[84rem]:grid-cols-6">
          <StatCard label="Total residents" value={d.tonight.residents} hint="Checked in tonight" icon={<Users className="h-3.5 w-3.5" />} tone="accent" href="/students?status=ACTIVE" />
          <StatCard label="Vacant beds" value={d.beds.available} hint={`${d.beds.occupied} occupied of ${d.beds.total}`} icon={<BedDouble className="h-3.5 w-3.5" />} tone="info" href="/rooms" />
          <StatCard label="Away tonight" value={d.tonight.away} hint={`${d.tonight.notResponded} not responded`} icon={<UserX className="h-3.5 w-3.5" />} tone="warn" href="/overnight" />
          <StatCard label="Stock alerts" value={stockAlertCount} hint={`${d.alerts.out.length} out of stock`} icon={<Package className="h-3.5 w-3.5" />} tone={stockAlertCount ? "bad" : "good"} href="/kitchen/stock" />
          <StatCard label="Pending requests" value={d.pendingRequests} hint="Shopping requests" icon={<ClipboardList className="h-3.5 w-3.5" />} tone={d.pendingRequests ? "warn" : "neutral"} href="/kitchen/requests" />
          {finance && d.kitchen ? (
            <StatCard label="Food spend" value={formatMoney(d.kitchen.foodSpend)} hint="This month" icon={<Soup className="h-3.5 w-3.5" />} tone="neutral" href="/reports" />
          ) : (
            <StatCard label="Outstanding rent" value={formatMoney(d.rent.outstandingAll)} hint="All months" icon={<Wallet className="h-3.5 w-3.5" />} tone={d.rent.outstandingAll > 0 ? "bad" : "good"} href="/rent?status=OVERDUE" />
          )}
        </div>
      </div>

      {/* ───────── Right column ───────── */}
      <div className="grid content-start gap-5 @3xl:grid-cols-2 @6xl:col-span-3 @6xl:grid-cols-1">
        <Card
          title="Occupancy"
          action={
            <Link href="/rooms" className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-card-2 hover:text-ink" aria-label="Rooms & beds">
              <Plus className="h-4 w-4" />
            </Link>
          }
        >
          <Badge tone="accent" className="-mt-3 mb-4">
            {d.beds.rate >= 90 ? "Full house" : d.beds.rate >= 60 ? "Healthy" : "Room to fill"}
          </Badge>
          <OccupancyCard rate={d.beds.rate} occupied={d.beds.occupied} total={d.beds.total} />
          <div className="mt-4 flex items-baseline justify-between px-1">
            <p className="tabular text-lg font-medium tracking-[0.2em] text-ink">
              {String(d.beds.occupied).padStart(2, "0")} / {String(d.beds.total).padStart(2, "0")}
            </p>
            <p className="text-xs text-ink-3">beds occupied</p>
          </div>
          <p className="mt-1 px-1 text-xs text-ink-3">
            {d.beds.available} available · {d.beds.reserved} reserved · {d.beds.maintenance} maintenance
          </p>
        </Card>

        <Card title="Tonight at the hostel" className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "repeating-radial-gradient(circle at 100% 0, #fff 0 1px, transparent 1px 9px)" }} />
          <div className="relative">
            <SegmentedProgress value={tonightPct} segments={5} label="Residents expected tonight" />
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-ink-2">
                <span className="text-ink">{d.tonight.expected}</span> expected of {d.tonight.residents} residents
              </span>
              <span className="tabular text-ink-2">{tonightPct}%</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniStat icon={<Moon className="h-3.5 w-3.5" />} label="Away" value={d.tonight.away} />
              <MiniStat icon={<Coffee className="h-3.5 w-3.5" />} label="Breakfast" value={d.breakfast.expected} />
              <MiniStat icon={<Soup className="h-3.5 w-3.5" />} label="Dinner" value={d.dinner.expected} />
            </div>
            {d.tonight.notResponded > 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3">
                <UserCheck className="h-3.5 w-3.5" /> {d.tonight.notResponded} not responded (counted as expected)
              </p>
            )}
            <Link href="/overnight" className="mt-1 inline-flex items-center gap-1 py-2 text-xs text-accent-hi hover:underline">
              Overnight details <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </Card>

        <Card
          title="Recent payments"
          action={
            <Link href="/rent" className="grid h-8 w-8 place-items-center rounded-full border border-line-2 text-ink-2 hover:bg-card-2 hover:text-ink" aria-label="All rent">
              <ChevronRight className="h-4 w-4" />
            </Link>
          }
        >
          {d.recentPayments.length === 0 ? (
            <p className="text-sm text-ink-3">No payments recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {d.recentPayments.map((p) => (
                <li key={p.id}>
                  <Link href={`/rent/${p.invoiceId}`} className="flex items-center gap-3 rounded-2xl bg-card-2 px-3 py-2.5 hover:bg-card-3">
                    <Avatar name={p.name} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{p.name}</p>
                      <p className="text-[11px] text-ink-3">{timeAgo(p.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-[13px] font-semibold text-ink">{formatMoney(p.amount)}</p>
                      <p className="text-[11px] text-ink-3">{label(p.method)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {stockAlertCount > 0 && (
          <Card title="Stock alerts" action={<AlertTriangle className="h-4 w-4 text-warn" />}>
            <ul className="space-y-2 text-sm">
              {[...d.alerts.out, ...d.alerts.low].slice(0, 5).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-ink-2">{i.name}</span>
                  <StatusBadge kind="stock" value={i.status} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-card-2 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[11px] text-ink-3">
        {icon}
        {label}
      </div>
      <p className="tabular mt-0.5 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

/** The "card" visual from the reference design, repurposed as an occupancy card. */
function OccupancyCard({ rate, occupied, total }: { rate: number; occupied: number; total: number }) {
  return (
    <div className="relative aspect-[1.75] w-full overflow-hidden rounded-2xl border border-line-2 card-art p-4">
      <svg viewBox="0 0 300 170" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="occ-wave" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.5" stopColor="#9ad9ea" />
            <stop offset="1" stopColor="#e6f6fb" />
          </linearGradient>
        </defs>
        <path
          d="M -10 150 C 40 150, 50 70, 90 70 S 120 140, 150 120 S 170 40, 200 45 S 230 110, 255 95 S 275 30, 310 40"
          fill="none"
          stroke="url(#occ-wave)"
          strokeWidth="14"
          strokeLinecap="round"
          opacity="0.85"
        />
      </svg>
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <span className="text-sm font-bold italic tracking-wide text-ink">{rate}%</span>
          <Wifi className="h-4 w-4 rotate-90 text-ink-2" />
        </div>
        <div className="flex items-end justify-between">
          <MasqaniLogo variant="inline" className="h-5" />
          <span className="tabular text-[11px] text-ink-2">
            {occupied}/{total}
          </span>
        </div>
      </div>
    </div>
  );
}
