import Link from "next/link";
import { BedDouble, Bell, ChevronRight, Megaphone, Moon, Sunrise, Sunset, UtensilsCrossed, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireStudentSelf } from "@/lib/auth/guards";
import { formatDate, formatDayLong, formatMonth, HOSTEL_TZ, monthStart, toISODate, today } from "@/lib/dates";
import { formatMoney, round2, toNumber } from "@/lib/format";
import { computeRentStatus, studentOutstanding } from "@/lib/services/rent";
import { isResidentOn } from "@/lib/services/attendance";
import { activeAnnouncements } from "@/lib/services/announcements";
import { getSettings } from "@/lib/services/settings";
import { AnnouncementCard } from "@/components/announcement-card";
import { Badge, Callout, Card, EmptyState, LinkButton, SegmentedProgress, StatCard } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { canAnswerOvernight, getMyStudent } from "./_data";
import { NightQuickButtons } from "./overnight/night-controls";

export const metadata = { title: "My dashboard" };

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: HOSTEL_TZ }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function StudentDashboard() {
  const user = await requireStudentSelf();
  const t = today();
  const studentId = user.studentId;

  const [student, invoice, outstanding, tonight, residentTonight, meals, announcements, unread, settings] = await Promise.all([
    getMyStudent(studentId),
    db.rentInvoice.findUnique({ where: { studentId_periodMonth: { studentId, periodMonth: monthStart(t) } } }),
    studentOutstanding(studentId),
    db.overnightStatus.findUnique({ where: { studentId_date: { studentId, date: t } } }),
    isResidentOn(studentId, t),
    db.meal.findMany({ where: { date: t } }),
    activeAnnouncements("STUDENT", 3),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    getSettings(),
  ]);

  const stay = student.activeAccommodation;
  const inv = invoice && !invoice.voidedAt ? invoice : null;
  const due = inv ? toNumber(inv.amountDue) : 0;
  const paid = inv ? toNumber(inv.amountPaid) : 0;
  const invOutstanding = round2(due - paid);
  const pctPaid = due > 0 ? Math.min(100, (paid / due) * 100) : 0;
  const invStatus = inv ? computeRentStatus(due, paid, inv.dueDate, t) : null;
  const tonightStatus = tonight?.status ?? "NOT_RESPONDED";
  const breakfast = meals.find((m) => m.type === "BREAKFAST");
  const dinner = meals.find((m) => m.type === "DINNER");
  const firstName = student.fullName.split(/\s+/)[0] ?? student.fullName;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 @xl:flex-row @xl:items-end @xl:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-ink-3">{formatDayLong(t)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <BedDouble className="h-4 w-4 text-ink-3" />
            {stay ? (
              <>
                {stay.bed.room.name} · {stay.bed.label}
              </>
            ) : (
              "No bed assigned"
            )}
            {student.status !== "ACTIVE" && <StatusBadge kind="student" value={student.status} />}
          </p>
        </div>
        <Link
          href="/notifications"
          className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-line-2/60 bg-card-2 px-4 text-sm text-ink hover:bg-card-3 @xl:self-auto"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "Notifications"}
        </Link>
      </div>

      <div className="grid gap-5 @4xl:grid-cols-3">
        {/* Rent */}
        <Card
          title="Rent this month"
          subtitle={formatMonth(t, "long")}
          action={<LinkButton href="/me/rent" variant="ghost" size="sm">Details <ChevronRight className="h-3.5 w-3.5" /></LinkButton>}
          className="@4xl:col-span-2"
        >
          {inv ? (
            <div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-ink-3">Outstanding this month</p>
                  <p className="tabular text-3xl font-semibold tracking-tight text-ink">{formatMoney(invOutstanding)}</p>
                </div>
                {invStatus && <StatusBadge kind="rent" value={invStatus} />}
              </div>
              <SegmentedProgress value={pctPaid} className="mt-4" label="Share of this month's rent paid" />
              <div className="mt-2 flex justify-between text-xs text-ink-3">
                <span>{Math.round(pctPaid)}% paid</span>
                <span>Due {formatDate(inv.dueDate)}</span>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 @xl:grid-cols-4">
                {[
                  { label: "Amount due", value: formatMoney(due) },
                  { label: "Paid", value: formatMoney(paid) },
                  { label: "Due date", value: formatDate(inv.dueDate) },
                  { label: "Total outstanding", value: formatMoney(outstanding) },
                ].map((x) => (
                  <div key={x.label} className="rounded-xl bg-card-2/60 px-3 py-2.5">
                    <dt className="text-[11px] text-ink-3">{x.label}</dt>
                    <dd className="tabular mt-0.5 text-sm font-medium text-ink">{x.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <div className="space-y-3">
              <EmptyState icon={<Wallet className="h-5 w-5" />} title="No rent record for this month yet" />
              {outstanding > 0 && (
                <Callout tone="warn" title={`Total outstanding: ${formatMoney(outstanding)}`}>
                  From earlier months. See My Rent for details.
                </Callout>
              )}
            </div>
          )}
        </Card>

        {/* Tonight */}
        <Card
          title="Tonight"
          subtitle="Are you sleeping at the hostel?"
          action={<LinkButton href="/me/overnight" variant="ghost" size="sm">Planner <ChevronRight className="h-3.5 w-3.5" /></LinkButton>}
        >
          {residentTonight ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-lo text-accent-hi">
                  <Moon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs text-ink-3">Your answer</p>
                  <StatusBadge kind="overnight" value={tonightStatus} />
                </div>
              </div>
              {canAnswerOvernight(student.status) ? (
                <NightQuickButtons date={toISODate(t)} current={tonightStatus} stayLabel="I'm staying" awayLabel="I'll be away" size="md" />
              ) : (
                <p className="text-xs text-ink-3">Overnight answers are closed for your account.</p>
              )}
              <p className="text-xs text-ink-3">No answer counts as staying. Away means no dinner tonight and no breakfast tomorrow.</p>
            </div>
          ) : (
            <EmptyState icon={<Moon className="h-5 w-5" />} title="Not booked in tonight" />
          )}
        </Card>

        {/* Meals */}
        <Card
          title="Today's meals"
          action={<LinkButton href="/me/meals" variant="ghost" size="sm">Timetable <ChevronRight className="h-3.5 w-3.5" /></LinkButton>}
          className="@4xl:col-span-1"
        >
          <div className="space-y-3">
            {[
              { label: "Breakfast", time: settings.breakfastTime, meal: breakfast, icon: <Sunrise className="h-4 w-4" /> },
              { label: "Dinner", time: settings.dinnerTime, meal: dinner, icon: <Sunset className="h-4 w-4" /> },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-line bg-card-2/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-medium text-ink-2">
                    {m.icon}
                    {m.label}
                  </span>
                  <Badge>{m.time}</Badge>
                </div>
                <p className="mt-1.5 text-sm text-ink">{m.meal?.menu ?? <span className="text-ink-3">Menu not posted yet</span>}</p>
                {m.meal?.notes && <p className="mt-0.5 text-xs text-ink-3">{m.meal.notes}</p>}
              </div>
            ))}
          </div>
        </Card>

        {/* Announcements */}
        <Card
          title="Announcements"
          action={<LinkButton href="/me/announcements" variant="ghost" size="sm">All <ChevronRight className="h-3.5 w-3.5" /></LinkButton>}
          className="@4xl:col-span-2"
        >
          {announcements.length === 0 ? (
            <EmptyState icon={<Megaphone className="h-5 w-5" />} title="No announcements right now" />
          ) : (
            <div className="space-y-3">
              {announcements.map((a) => (
                <AnnouncementCard key={a.id} a={a} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 @xl:grid-cols-4">
        <StatCard label="Total outstanding" value={formatMoney(outstanding)} tone={outstanding > 0 ? "warn" : "good"} icon={<Wallet className="h-3.5 w-3.5" />} href="/me/rent" />
        <StatCard
          label="Monthly rent"
          value={formatMoney(stay ? stay.monthlyRent : student.monthlyRent)}
          hint={`Due on day ${student.rentDueDay}`}
          icon={<BedDouble className="h-3.5 w-3.5" />}
          tone="accent"
          href="/me/room"
        />
        <StatCard label="Unread notifications" value={unread} icon={<Bell className="h-3.5 w-3.5" />} tone="info" href="/notifications" />
        <StatCard label="Meals" value="Timetable" hint="This week & next" icon={<UtensilsCrossed className="h-3.5 w-3.5" />} href="/me/meals" />
      </div>
    </div>
  );
}
