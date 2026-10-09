import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2, Utensils } from "lucide-react";
import type { MealType } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { mealExpectation } from "@/lib/services/attendance";
import { addDays, formatDate, formatDayShort, parseDateOnly, toISODate, today } from "@/lib/dates";
import { formatNumber, toNumber } from "@/lib/format";
import { cn, sp } from "@/lib/utils";
import { ConfirmAction, Dialog } from "@/components/ui/dialog";
import { Badge, Callout, LinkButton, PageHeader } from "@/components/ui/primitives";
import { copyPreviousWeek, deleteMeal } from "./actions";
import { MealForm } from "./meal-form";

export const metadata = { title: "Meal timetable" };

const TYPES: MealType[] = ["BREAKFAST", "DINNER"];
const TYPE_LABEL: Record<MealType, string> = { BREAKFAST: "Breakfast", DINNER: "Dinner" };

function parseDateParam(v: string | undefined): Date | null {
  if (!v) return null;
  try {
    return parseDateOnly(v);
  } catch {
    return null;
  }
}

const mondayOf = (d: Date) => addDays(d, -((d.getUTCDay() + 6) % 7));

export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("meals.manage");
  const params = await searchParams;
  const now = today();
  const thisWeek = mondayOf(now);
  const start = mondayOf(parseDateParam(sp(params, "week")) ?? now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const end = days[6]!;

  const [meals, expectations] = await Promise.all([
    db.meal.findMany({
      where: { date: { gte: start, lte: end } },
      include: { record: true },
    }),
    Promise.all(days.flatMap((d) => TYPES.map((t) => mealExpectation(d, t)))),
  ]);
  const mealMap = new Map(meals.map((m) => [`${toISODate(m.date)}|${m.type}`, m]));
  const expMap = new Map(expectations.map((e) => [`${toISODate(e.date)}|${e.type}`, e]));
  const weekHref = (d: Date) => `/meals?week=${toISODate(d)}`;
  const planned = meals.length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Meal timetable"
        description={`Week of ${formatDate(start)} – ${formatDate(end)} · ${planned} of 14 meals planned`}
        actions={
          <>
            <LinkButton href={weekHref(addDays(start, -7))} variant="secondary" size="icon" aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </LinkButton>
            {start.getTime() !== thisWeek.getTime() && (
              <LinkButton href="/meals" variant="ghost">
                This week
              </LinkButton>
            )}
            <LinkButton href={weekHref(addDays(start, 7))} variant="secondary" size="icon" aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </LinkButton>
            <ConfirmAction
              action={copyPreviousWeek}
              payload={{ week: toISODate(start) }}
              label={
                <>
                  <Copy className="h-4 w-4" /> Copy previous week
                </>
              }
              size="md"
              title="Copy last week's menu?"
              message="Meals from the previous week are copied into the empty slots of this week. Meals already set are kept."
              confirmLabel="Copy meals"
            />
            <Dialog
              trigger={
                <>
                  <Plus className="h-4 w-4" /> Add meal
                </>
              }
              triggerVariant="primary"
              title="Add meal"
            >
              <MealForm initial={{ date: toISODate(start.getTime() <= now.getTime() && now.getTime() <= end.getTime() ? now : start), type: "DINNER" }} />
            </Dialog>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-4 @[110rem]:grid-cols-7">
        {days.map((d) => {
          const isToday = d.getTime() === now.getTime();
          const iso = toISODate(d);
          return (
            <section
              key={iso}
              className={cn(
                "flex flex-col rounded-card border bg-card p-3",
                isToday ? "border-accent ring-1 ring-accent/40" : "border-line",
              )}
            >
              <header className="mb-2 flex items-center justify-between gap-2 px-1">
                <h2 className="text-sm font-medium text-ink">{formatDayShort(d)}</h2>
                {isToday && <Badge tone="accent">Today</Badge>}
              </header>
              <div className="flex flex-1 flex-col gap-2">
                {TYPES.map((t) => {
                  const meal = mealMap.get(`${iso}|${t}`);
                  const exp = expMap.get(`${iso}|${t}`)!;
                  return (
                    <div key={t} className="flex flex-1 flex-col gap-1.5 rounded-xl bg-card-2/60 p-2.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{TYPE_LABEL[t]}</span>
                        {meal ? (
                          <span className="flex items-center">
                            <Dialog
                              trigger={<Pencil className="h-3.5 w-3.5" />}
                              triggerVariant="ghost"
                              triggerSize="icon"
                              triggerClassName="h-7 w-7"
                              title={`Edit ${TYPE_LABEL[t].toLowerCase()} — ${formatDayShort(d)}`}
                            >
                              <MealForm
                                initial={{ id: meal.id, date: iso, type: t, menu: meal.menu, notes: meal.notes ?? "" }}
                                lockSlot={!!meal.record}
                              />
                            </Dialog>
                            {!meal.record && (
                              <ConfirmAction
                                action={deleteMeal}
                                payload={{ id: meal.id }}
                                label={<Trash2 className="h-3.5 w-3.5" />}
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Remove this meal?"
                                message={`${TYPE_LABEL[t]} on ${formatDayShort(d)}: "${meal.menu}" will be removed from the timetable.`}
                                confirmLabel="Remove"
                                confirmVariant="danger"
                              />
                            )}
                          </span>
                        ) : (
                          <Dialog
                            trigger={<Plus className="h-3.5 w-3.5" />}
                            triggerVariant="ghost"
                            triggerSize="icon"
                            triggerClassName="h-7 w-7"
                            title={`Add ${TYPE_LABEL[t].toLowerCase()} — ${formatDayShort(d)}`}
                          >
                            <MealForm initial={{ date: iso, type: t }} lockSlot />
                          </Dialog>
                        )}
                      </div>
                      {meal ? (
                        <>
                          <p className="wrap-break-word text-sm text-ink">{meal.menu}</p>
                          {meal.notes && <p className="wrap-break-word text-xs text-ink-3">{meal.notes}</p>}
                        </>
                      ) : (
                        <p className="text-sm italic text-ink-3">No menu set</p>
                      )}
                      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-0.5 pt-1 text-xs text-ink-2">
                        <span>
                          Expected <b className="tabular text-ink">{exp.expected}</b>
                        </span>
                        {exp.away > 0 && (
                          <span>
                            Away <b className="tabular text-warn">{exp.away}</b>
                          </span>
                        )}
                      </div>
                      {meal?.record && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2">
                          <span>
                            Served <b className="tabular text-good">{meal.record.servedCount}</b>
                          </span>
                          <span>
                            Leftovers <b className="tabular text-ink">{formatNumber(toNumber(meal.record.leftoverPortions))}</b>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {planned === 0 && (
        <Callout tone="warn" title="Nothing planned this week">
          Add meals one by one with the <Utensils className="inline h-3.5 w-3.5" /> + buttons, or copy last week&apos;s menu.
        </Callout>
      )}

      <Callout tone="info" title="How expected counts work">
        Breakfast uses the previous night&apos;s overnight answers; dinner uses tonight&apos;s. Students marked away are excluded and
        students who have not responded are counted as expected.
      </Callout>
    </div>
  );
}
