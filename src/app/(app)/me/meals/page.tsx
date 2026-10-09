import Link from "next/link";
import { ChevronLeft, ChevronRight, Sunrise, Sunset, UtensilsCrossed } from "lucide-react";
import { db } from "@/lib/db";
import { requireStudentSelf } from "@/lib/auth/guards";
import { addDays, formatDate, formatDayShort, toISODate, today } from "@/lib/dates";
import { getSettings } from "@/lib/services/settings";
import { Badge, Callout, Card, FilterTabs, LinkButton, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const metadata = { title: "Meals" };

const MIN_OFFSET = -4;
const MAX_OFFSET = 4;

function mondayOf(d: Date): Date {
  return addDays(d, -((d.getUTCDay() + 6) % 7));
}

export default async function MyMealsPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const user = await requireStudentSelf();
  const { w } = await searchParams;
  const parsed = Number.parseInt(w ?? "0", 10);
  const offset = Number.isFinite(parsed) ? Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, parsed)) : 0;

  const t = today();
  const start = addDays(mondayOf(t), offset * 7);
  const end = addDays(start, 6);

  const [meals, myNights, settings] = await Promise.all([
    db.meal.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true, type: true, menu: true, notes: true },
    }),
    // Only the signed-in student's own answers (breakfast on D depends on night D−1).
    db.overnightStatus.findMany({
      where: { studentId: user.studentId, date: { gte: addDays(start, -1), lte: end }, status: "AWAY" },
      select: { date: true },
    }),
    getSettings(),
  ]);
  const mealMap = new Map(meals.map((m) => [`${toISODate(m.date)}|${m.type}`, m]));
  const awayNights = new Set(myNights.map((n) => toISODate(n.date)));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const iso = toISODate(d);
    return {
      date: d,
      iso,
      isToday: iso === toISODate(t),
      isPast: d.getTime() < t.getTime(),
      breakfast: mealMap.get(`${iso}|BREAKFAST`),
      dinner: mealMap.get(`${iso}|DINNER`),
      noBreakfast: awayNights.has(toISODate(addDays(d, -1))),
      noDinner: awayNights.has(iso),
    };
  });

  const weekLabel = offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : `Week of ${formatDate(start)}`;

  return (
    <div>
      <PageHeader
        title="Meal timetable"
        description={`Breakfast at ${settings.breakfastTime} · Dinner at ${settings.dinnerTime}`}
        actions={
          <div className="flex items-center gap-1">
            {offset > MIN_OFFSET ? (
              <LinkButton href={`/me/meals?w=${offset - 1}`} variant="ghost" size="icon" aria-label="Previous week">
                <ChevronLeft className="h-4 w-4" />
              </LinkButton>
            ) : (
              <span className="h-10 w-10" />
            )}
            <FilterTabs
              active={String(offset)}
              tabs={[
                { label: "This week", value: "0", href: "/me/meals" },
                { label: "Next week", value: "1", href: "/me/meals?w=1" },
              ]}
            />
            {offset < MAX_OFFSET ? (
              <LinkButton href={`/me/meals?w=${offset + 1}`} variant="ghost" size="icon" aria-label="Next week">
                <ChevronRight className="h-4 w-4" />
              </LinkButton>
            ) : (
              <span className="h-10 w-10" />
            )}
          </div>
        }
      />

      <div className="mb-5">
        <Callout tone="info" title="Going to be away?">
          If you mark a night as away, the kitchen will not prepare dinner for you that evening or breakfast the next morning.
          Update your answers on <Link href="/me/overnight" className="underline underline-offset-2">My overnight status</Link>.
        </Callout>
      </div>

      <Card title={weekLabel} subtitle={`${formatDate(start)} – ${formatDate(end)}`}>
        <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-4 @6xl:grid-cols-7">
          {days.map((d) => (
            <div
              key={d.iso}
              className={cn(
                "flex flex-col rounded-2xl border p-3",
                d.isToday ? "border-accent/60 bg-accent-lo/40" : "border-line bg-card-2/40",
                d.isPast && !d.isToday && "opacity-60",
              )}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{formatDayShort(d.date)}</span>
                {d.isToday && <Badge tone="accent">Today</Badge>}
              </div>
              <MealSlot icon={<Sunrise className="h-3.5 w-3.5" />} label="Breakfast" meal={d.breakfast} away={d.noBreakfast} />
              <div className="my-2.5 border-t border-line/70" />
              <MealSlot icon={<Sunset className="h-3.5 w-3.5" />} label="Dinner" meal={d.dinner} away={d.noDinner} />
            </div>
          ))}
        </div>
        {meals.length === 0 && (
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-3">
            <UtensilsCrossed className="h-4 w-4" /> The kitchen has not posted menus for this week yet.
          </p>
        )}
      </Card>
    </div>
  );
}

function MealSlot({
  icon,
  label,
  meal,
  away,
}: {
  icon: React.ReactNode;
  label: string;
  meal?: { menu: string; notes: string | null };
  away: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">
          {icon}
          {label}
        </span>
        {away && <Badge tone="warn">You&apos;re away</Badge>}
      </div>
      <p className={cn("mt-1 text-sm", meal ? "text-ink" : "text-ink-3")}>{meal?.menu ?? "Not posted"}</p>
      {meal?.notes && <p className="mt-0.5 text-xs text-ink-3">{meal.notes}</p>}
    </div>
  );
}
