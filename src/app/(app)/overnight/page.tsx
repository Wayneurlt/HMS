import Link from "next/link";
import { BedDouble, CalendarRange, ChevronLeft, ChevronRight, HelpCircle, Home, Moon, Pencil, Plane, Users, X } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { nightSummaries, type ResidentNight } from "@/lib/services/attendance";
import { addDays, formatDate, formatDayLong, formatDayShort, parseDateOnly, toISODate, today } from "@/lib/dates";
import { cn, sp } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Avatar, Callout, Card, EmptyState, LinkButton, PageHeader, StatCard } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { BulkOvernightForm, OvernightEditForm, QuickOvernightButton } from "./overnight-forms";

export const metadata = { title: "Overnight status" };

const CALENDAR_DAYS = 14;

function parseDateParam(v: string | undefined): Date | null {
  if (!v) return null;
  try {
    return parseDateOnly(v);
  } catch {
    return null;
  }
}

export default async function OvernightPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("overnight.view");
  const canManage = can(user.role, "overnight.manage");
  const params = await searchParams;
  const now = today();
  const date = parseDateParam(sp(params, "date")) ?? now;
  const iso = toISODate(date);
  const isToday = date.getTime() === now.getTime();

  const [summaries, bulkStudents] = await Promise.all([
    nightSummaries(date, addDays(date, CALENDAR_DAYS - 1)),
    canManage
      ? db.student.findMany({
          where: {
            deletedAt: null,
            accommodations: { some: { OR: [{ endDate: null }, { endDate: { gt: date } }] } },
          },
          select: { id: true, fullName: true },
          orderBy: { fullName: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const night = summaries[0]!;
  const away = night.students.filter((s) => s.status === "AWAY");
  const notResponded = night.students.filter((s) => s.status === "NOT_RESPONDED");
  const staying = night.students.filter((s) => s.status === "STAYING");
  const href = (d: Date) => `/overnight?date=${toISODate(d)}`;

  const rowActions = (s: ResidentNight) =>
    canManage ? (
      <div className="flex shrink-0 items-center">
        {s.status !== "STAYING" && (
          <QuickOvernightButton studentId={s.studentId} date={iso} status="STAYING" title="Mark staying" icon>
            <Home className="h-4 w-4" />
            <span className="sr-only">Mark staying</span>
          </QuickOvernightButton>
        )}
        <Dialog
          trigger={
            <>
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Set answer</span>
            </>
          }
          triggerVariant="ghost"
          triggerSize="icon"
          triggerClassName="h-8 w-8"
          title={`${s.fullName} — ${formatDayShort(date)}`}
          description="Set this student's answer for the night."
        >
          <OvernightEditForm
            studentId={s.studentId}
            date={iso}
            initial={{
              status: s.status,
              expectedReturnDate: s.expectedReturnDate ? toISODate(s.expectedReturnDate) : toISODate(addDays(date, 1)),
              note: s.note ?? "",
            }}
          />
        </Dialog>
        {s.status !== "NOT_RESPONDED" && (
          <QuickOvernightButton studentId={s.studentId} date={iso} status="CLEAR" title="Clear answer (not responded)" icon>
            <X className="h-4 w-4" />
            <span className="sr-only">Clear answer</span>
          </QuickOvernightButton>
        )}
      </div>
    ) : null;

  const studentList = (list: ResidentNight[], showReturn = false) => (
    <ul className="divide-y divide-line/70">
      {list.map((s) => (
        <li key={s.studentId} className="flex items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
          <div className="flex min-w-0 items-start gap-3">
            <Avatar name={s.fullName} size={32} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/students/${s.studentId}`} className="truncate text-sm font-medium text-ink hover:text-accent-hi">
                  {s.fullName}
                </Link>
                <StatusBadge kind="overnight" value={s.status} />
              </div>
              <p className="text-xs text-ink-3">
                {s.room} · {s.bed}
                {showReturn && <> · Back {s.expectedReturnDate ? formatDayShort(s.expectedReturnDate) : "date not given"}</>}
              </p>
              {s.note && <p className="mt-0.5 wrap-break-word text-xs text-ink-2">“{s.note}”</p>}
            </div>
          </div>
          {rowActions(s)}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Overnight status"
        description={
          <>
            {isToday ? "Tonight" : "Night of"} {formatDayLong(date)}
            {!isToday && <> · {date < now ? "past night" : "upcoming"}</>}
          </>
        }
        actions={
          <>
            <LinkButton href={href(addDays(date, -1))} variant="secondary" size="icon" aria-label="Previous night">
              <ChevronLeft className="h-4 w-4" />
            </LinkButton>
            <form method="get" action="/overnight" className="flex items-center gap-2">
              <input
                type="date"
                name="date"
                defaultValue={iso}
                aria-label="Night"
                className="h-10 rounded-xl border border-line-2 bg-card-2 px-3 text-sm text-ink focus:border-accent focus:outline-none"
              />
              <button type="submit" className="h-10 rounded-full border border-line-2/60 bg-card-2 px-4 text-sm font-medium text-ink hover:bg-card-3">
                Go
              </button>
            </form>
            <LinkButton href={href(addDays(date, 1))} variant="secondary" size="icon" aria-label="Next night">
              <ChevronRight className="h-4 w-4" />
            </LinkButton>
            {!isToday && (
              <LinkButton href="/overnight" variant="ghost">
                Tonight
              </LinkButton>
            )}
            {canManage && (
              <Dialog
                trigger={
                  <>
                    <CalendarRange className="h-4 w-4" /> Set for date range
                  </>
                }
                triggerVariant="primary"
                title="Set answer for a date range"
                description="Use for trips, holidays or exam breaks."
              >
                {bulkStudents.length === 0 ? (
                  <p className="text-sm text-ink-3">No current or upcoming residents.</p>
                ) : (
                  <BulkOvernightForm students={bulkStudents.map((s) => ({ id: s.id, label: s.fullName }))} defaultFrom={iso} />
                )}
              </Dialog>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @4xl:grid-cols-5">
        <StatCard label="Residents" value={night.residents} icon={<Users className="h-3.5 w-3.5" />} hint="Booked for the night" />
        <StatCard label="Expected at hostel" value={night.expected} icon={<BedDouble className="h-3.5 w-3.5" />} tone="accent" hint="Residents − away" />
        <StatCard label="Staying" value={night.staying} icon={<Home className="h-3.5 w-3.5" />} tone="good" hint="Confirmed" />
        <StatCard label="Away" value={night.away} icon={<Plane className="h-3.5 w-3.5" />} tone="warn" />
        <StatCard
          label="Not responded"
          value={night.notResponded}
          icon={<HelpCircle className="h-3.5 w-3.5" />}
          hint="Counted as expected"
          className="col-span-2 @xl:col-span-1"
        />
      </div>

      {night.residents === 0 ? (
        <Card>
          <EmptyState icon={<Moon className="h-5 w-5" />} title="No residents this night" description="Check students in to a bed to start tracking overnight answers." />
        </Card>
      ) : (
        <div className="grid gap-5 @6xl:grid-cols-3">
          <Card title="Away" subtitle={`${away.length} student${away.length === 1 ? "" : "s"} not sleeping at the hostel`}>
            {away.length === 0 ? <p className="text-sm text-ink-3">Nobody is away.</p> : studentList(away, true)}
          </Card>
          <Card title="Not responded" subtitle="No answer yet — counted as expected">
            {notResponded.length === 0 ? <p className="text-sm text-ink-3">Everyone has answered.</p> : studentList(notResponded)}
          </Card>
          <Card title="Staying" subtitle="Confirmed staying">
            {staying.length === 0 ? <p className="text-sm text-ink-3">No confirmations yet.</p> : studentList(staying)}
          </Card>
        </div>
      )}

      <Card title="Next 14 nights" subtitle={`From ${formatDate(date)} · select a night to see details`}>
        <ul className="grid grid-cols-1 gap-2 @xl:grid-cols-2 @4xl:grid-cols-7">
          {summaries.map((n) => {
            const selected = n.date.getTime() === date.getTime();
            const isTonight = n.date.getTime() === now.getTime();
            return (
              <li key={n.date.toISOString()}>
                <Link
                  href={href(n.date)}
                  className={cn(
                    "flex h-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors @4xl:flex-col @4xl:items-start @4xl:justify-start",
                    selected ? "border-accent bg-accent-lo" : "border-line bg-card-2/50 hover:border-line-2 hover:bg-card-2",
                  )}
                >
                  <span className="shrink-0 whitespace-nowrap font-medium text-ink">
                    {formatDayShort(n.date)}
                    {isTonight && <span className="ml-1.5 text-[11px] font-normal text-accent-hi">Tonight</span>}
                  </span>
                  <span className="flex flex-wrap justify-end gap-x-3 gap-y-0.5 text-right text-xs text-ink-2 @4xl:flex-col @4xl:justify-start @4xl:text-left">
                    <span>
                      Expected <b className="tabular text-ink">{n.expected}</b>
                    </span>
                    <span>
                      Away <b className={cn("tabular", n.away > 0 ? "text-warn" : "text-ink")}>{n.away}</b>
                    </span>
                    <span>
                      Not responded <b className="tabular text-ink">{n.notResponded}</b>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <Callout tone="info" title="How this feeds the kitchen">
        Dinner uses tonight&apos;s answers; the next morning&apos;s breakfast uses the same night. Students marked away are excluded and
        students who have not responded are counted as expected.
      </Callout>
    </div>
  );
}
