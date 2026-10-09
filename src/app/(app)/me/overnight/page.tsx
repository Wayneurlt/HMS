import { CalendarRange, History, Moon } from "lucide-react";
import { db } from "@/lib/db";
import { requireStudentSelf } from "@/lib/auth/guards";
import { addDays, formatDate, formatDayShort, toISODate, today } from "@/lib/dates";
import { Badge, Callout, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { canAnswerOvernight, getMyStays, getMyStudent, residentOnNight } from "../_data";
import { AwayDetailsDialog, NightQuickButtons, RangeForm } from "./night-controls";

export const metadata = { title: "My overnight status" };

const AHEAD = 14;
const BEHIND = 14;

export default async function MyOvernightPage() {
  const user = await requireStudentSelf();
  const t = today();
  const from = addDays(t, -BEHIND);
  const to = addDays(t, AHEAD - 1);

  const [student, stays, answers] = await Promise.all([
    getMyStudent(user.studentId),
    getMyStays(user.studentId),
    db.overnightStatus.findMany({
      where: { studentId: user.studentId, date: { gte: from, lte: to } },
      select: { date: true, status: true, expectedReturnDate: true, note: true },
    }),
  ]);
  const byDate = new Map(answers.map((a) => [toISODate(a.date), a]));
  const canAnswer = canAnswerOvernight(student.status);

  const nights = (start: Date, count: number) =>
    Array.from({ length: count }, (_, i) => {
      const d = addDays(start, i);
      const a = byDate.get(toISODate(d));
      return {
        date: d,
        iso: toISODate(d),
        resident: residentOnNight(stays, d),
        status: (a?.status ?? "NOT_RESPONDED") as "STAYING" | "AWAY" | "NOT_RESPONDED",
        expectedReturnDate: a?.expectedReturnDate ?? null,
        note: a?.note ?? null,
      };
    });
  const upcoming = nights(t, AHEAD);
  const past = nights(from, BEHIND).reverse();
  const upcomingResident = upcoming.filter((n) => n.resident);
  const awayCount = upcomingResident.filter((n) => n.status === "AWAY").length;
  const unanswered = upcomingResident.filter((n) => n.status === "NOT_RESPONDED").length;

  return (
    <div>
      <PageHeader
        title="My overnight status"
        description="Tell the hostel whether you're sleeping here. It helps the kitchen cook the right amount."
      />

      {!canAnswer && (
        <div className="mb-5">
          <Callout tone="warn" title="Overnight answers are closed">
            Your account is not an active resident, so you cannot update your overnight status. Contact the hostel office.
          </Callout>
        </div>
      )}

      <div className="grid gap-5 @6xl:grid-cols-3">
        <Card
          title="Next 14 nights"
          subtitle={
            upcomingResident.length
              ? `${awayCount} away · ${unanswered} not responded — no answer counts as staying`
              : "You are not booked in for these nights"
          }
          className="@6xl:col-span-2"
        >
          <ul className="divide-y divide-line/70">
            {upcoming.map((n, i) => (
              <li key={n.iso} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 @xl:flex-row @xl:items-center @xl:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-semibold",
                      i === 0 ? "bg-accent-lo text-accent-hi" : "bg-card-2 text-ink-2",
                    )}
                  >
                    {n.date.getUTCDate()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">{formatDayShort(n.date)}</span>
                      {i === 0 && <Badge tone="accent">Tonight</Badge>}
                      {n.resident ? <StatusBadge kind="overnight" value={n.status} /> : <Badge>Not booked in</Badge>}
                    </div>
                    {n.status === "AWAY" && (n.expectedReturnDate || n.note) && (
                      <p className="mt-0.5 truncate text-xs text-ink-3">
                        {n.expectedReturnDate ? `Back ${formatDate(n.expectedReturnDate)}` : ""}
                        {n.expectedReturnDate && n.note ? " · " : ""}
                        {n.note ?? ""}
                      </p>
                    )}
                  </div>
                </div>
                {canAnswer && n.resident && (
                  <div className="flex flex-wrap items-center gap-1.5 @xl:justify-end">
                    <NightQuickButtons date={n.iso} current={n.status} showClear />
                    <AwayDetailsDialog
                      date={n.iso}
                      dateLabel={formatDayShort(n.date)}
                      defaultReturn={toISODate(n.expectedReturnDate ?? addDays(n.date, 1))}
                      defaultNote={n.note}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5">
          {canAnswer && (
            <Card title="Plan a date range" subtitle="Set many nights at once" action={<CalendarRange className="h-4 w-4 text-ink-3" />}>
              <RangeForm todayISO={toISODate(t)} />
            </Card>
          )}
          <Card title="How it works">
            <ul className="space-y-2 text-sm text-ink-2">
              <li className="flex gap-2">
                <Moon className="mt-0.5 h-4 w-4 shrink-0 text-accent-hi" />
                Each answer is for the <span className="text-ink">night</span> of that date.
              </li>
              <li>Away on a night means no dinner that evening and no breakfast the next morning.</li>
              <li>If you don&apos;t answer, the kitchen assumes you are staying.</li>
              <li>You can change or clear answers for tonight and future nights at any time.</li>
            </ul>
          </Card>
        </div>
      </div>

      <div className="mt-5">
        <Card title="Past 14 nights" subtitle="Read only" action={<History className="h-4 w-4 text-ink-3" />}>
          {past.every((n) => !n.resident) ? (
            <EmptyState icon={<Moon className="h-5 w-5" />} title="No history yet" description="You were not booked in during the past two weeks." />
          ) : (
            <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2 @4xl:grid-cols-4">
              {past.map((n) => (
                <div key={n.iso} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card-2/40 px-3 py-2.5">
                  <span className="text-sm text-ink-2">{formatDayShort(n.date)}</span>
                  {n.resident ? <StatusBadge kind="overnight" value={n.status} /> : <span className="text-xs text-ink-3">—</span>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
