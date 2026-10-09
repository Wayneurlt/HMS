import { ChevronLeft, ChevronRight, Coffee, History, Pencil, Soup } from "lucide-react";
import type { MealType } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { mealExpectation, type MealExpectation } from "@/lib/services/attendance";
import { addDays, formatDayLong, formatDayShort, formatDateTime, parseDateOnly, toISODate, today } from "@/lib/dates";
import { formatNumber, toNumber } from "@/lib/format";
import { sp } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Callout, Card, DetailList, LinkButton, PageHeader } from "@/components/ui/primitives";
import { MealForm } from "@/app/(app)/meals/meal-form";
import { RecordMealForm, type ChecklistStudent } from "./record-meal-form";

export const metadata = { title: "Today's meals" };

const TYPES: MealType[] = ["BREAKFAST", "DINNER"];

function parseDateParam(v: string | undefined): Date | null {
  if (!v) return null;
  try {
    return parseDateOnly(v);
  } catch {
    return null;
  }
}

export default async function KitchenTodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("meals.expected");
  const canRecord = can(user.role, "meals.record");
  const canManageMeals = can(user.role, "meals.manage");
  const params = await searchParams;
  const now = today();
  const date = parseDateParam(sp(params, "date")) ?? now;
  const iso = toISODate(date);
  const isToday = date.getTime() === now.getTime();
  const isFuture = date.getTime() > now.getTime();

  const [meals, expectations] = await Promise.all([
    db.meal.findMany({
      where: { date },
      include: {
        record: { include: { recordedBy: { select: { name: true } } } },
        attendances: { include: { student: { select: { fullName: true } } } },
      },
    }),
    Promise.all(TYPES.map((t) => mealExpectation(date, t))),
  ]);
  const href = (d: Date) => `/kitchen/today?date=${toISODate(d)}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title={isToday ? "Today's meals" : "Meals"}
        description={formatDayLong(date)}
        actions={
          <>
            <LinkButton href={href(addDays(date, -1))} variant="secondary" size="icon" aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </LinkButton>
            <form method="get" action="/kitchen/today" className="flex items-center gap-2">
              <input
                type="date"
                name="date"
                defaultValue={iso}
                aria-label="Day"
                className="h-10 rounded-xl border border-line-2 bg-card-2 px-3 text-sm text-ink focus:border-accent focus:outline-none"
              />
              <button type="submit" className="h-10 rounded-full border border-line-2/60 bg-card-2 px-4 text-sm font-medium text-ink hover:bg-card-3">
                Go
              </button>
            </form>
            <LinkButton href={href(addDays(date, 1))} variant="secondary" size="icon" aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </LinkButton>
            {!isToday && (
              <LinkButton href="/kitchen/today" variant="ghost">
                Today
              </LinkButton>
            )}
            {canRecord && (
              <LinkButton href="/kitchen/records" variant="secondary">
                <History className="h-4 w-4" /> Records
              </LinkButton>
            )}
          </>
        }
      />

      <div className="grid gap-5 @6xl:grid-cols-2">
        {TYPES.map((t, i) => {
          const meal = meals.find((m) => m.type === t);
          const exp = expectations[i]!;
          return (
            <MealCard
              key={t}
              type={t}
              date={date}
              iso={iso}
              exp={exp}
              meal={meal}
              canRecord={canRecord}
              canManageMeals={canManageMeals}
              isFuture={isFuture}
            />
          );
        })}
      </div>

      <Callout tone="info">
        Breakfast counts use last night&apos;s overnight answers; dinner uses tonight&apos;s. Students marked away are excluded and
        students who haven&apos;t responded are counted as expected.
      </Callout>
    </div>
  );
}

type MealWithRecord = {
  id: string;
  menu: string;
  notes: string | null;
  record: {
    expectedCount: number;
    servedCount: number;
    leftoverPortions: { toNumber(): number };
    notes: string | null;
    updatedAt: Date;
    recordedBy: { name: string } | null;
  } | null;
  attendances: { studentId: string; attended: boolean; student: { fullName: string } }[];
};

function MealCard({
  type,
  date,
  iso,
  exp,
  meal,
  canRecord,
  canManageMeals,
  isFuture,
}: {
  type: MealType;
  date: Date;
  iso: string;
  exp: MealExpectation;
  meal: MealWithRecord | undefined;
  canRecord: boolean;
  canManageMeals: boolean;
  isFuture: boolean;
}) {
  const title = type === "BREAKFAST" ? "Breakfast" : "Dinner";
  const Icon = type === "BREAKFAST" ? Coffee : Soup;
  const record = meal?.record ?? null;
  const attendance: Record<string, boolean> = Object.fromEntries((meal?.attendances ?? []).map((a) => [a.studentId, a.attended]));
  const attendedCount = meal?.attendances.filter((a) => a.attended).length ?? 0;

  // Checklist: expected students, then those marked away (they may turn up), then anyone already ticked.
  const checklist: ChecklistStudent[] = exp.expectedStudents.map(({ studentId, fullName, room, bed }) => ({
    studentId,
    fullName,
    where: `${room} · ${bed}`,
  }));
  const listedIds = new Set(checklist.map((s) => s.studentId));
  for (const s of exp.awayStudents) {
    if (listedIds.has(s.studentId)) continue;
    listedIds.add(s.studentId);
    checklist.push({ studentId: s.studentId, fullName: s.fullName, away: true });
  }
  for (const a of meal?.attendances ?? []) {
    if (listedIds.has(a.studentId)) continue;
    listedIds.add(a.studentId);
    checklist.push({ studentId: a.studentId, fullName: a.student.fullName });
  }

  const recordForm = meal && (
    <RecordMealForm
      mealId={meal.id}
      initial={
        record
          ? { servedCount: record.servedCount, leftoverPortions: toNumber(record.leftoverPortions), notes: record.notes ?? "" }
          : undefined
      }
      students={checklist}
      attendance={attendance}
    />
  );

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-accent-hi" /> {title}
        </span>
      }
      subtitle={formatDayShort(date)}
      action={record ? <Badge tone="good" dot>Recorded</Badge> : <Badge tone="neutral">Not recorded</Badge>}
      className="flex flex-col"
    >
      <div className="space-y-5">
        <div>
          {meal ? (
            <>
              <p className="wrap-break-word text-base font-medium text-ink">{meal.menu}</p>
              {meal.notes && <p className="mt-0.5 wrap-break-word text-xs text-ink-3">{meal.notes}</p>}
            </>
          ) : canManageMeals ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm italic text-ink-3">No menu set.</p>
              <Dialog
                trigger={
                  <>
                    <Pencil className="h-3.5 w-3.5" /> Set menu
                  </>
                }
                triggerSize="sm"
                title={`Set ${title.toLowerCase()} menu — ${formatDayShort(date)}`}
              >
                <MealForm initial={{ date: iso, type }} lockSlot />
              </Dialog>
            </div>
          ) : (
            <p className="text-sm italic text-ink-3">No menu set — ask the manager.</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-accent-lo px-3 py-3">
            <div className="text-xs text-ink-2">Expected</div>
            <div className="tabular text-3xl font-semibold text-ink">{exp.expected}</div>
          </div>
          <div className="rounded-xl bg-card-2 px-3 py-3">
            <div className="text-xs text-ink-2">Residents</div>
            <div className="tabular text-xl font-semibold text-ink">{exp.residents}</div>
          </div>
          <div className="rounded-xl bg-card-2 px-3 py-3">
            <div className="text-xs text-ink-2">Away</div>
            <div className="tabular text-xl font-semibold text-warn">{exp.away}</div>
          </div>
        </div>

        <div className="grid gap-4 @xl:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Expected ({exp.expectedStudents.length})</h3>
            {exp.expectedStudents.length === 0 ? (
              <p className="text-sm text-ink-3">Nobody expected.</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto pr-1 text-sm">
                {exp.expectedStudents.map((s) => (
                  <li key={s.studentId} className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-ink">
                      {s.fullName}
                      {s.status === "NOT_RESPONDED" && <span className="ml-1 text-[11px] text-ink-3">(no answer)</span>}
                    </span>
                    <span className="shrink-0 text-xs text-ink-3">
                      {s.room} · {s.bed}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Away ({exp.awayStudents.length})</h3>
            {exp.awayStudents.length === 0 ? (
              <p className="text-sm text-ink-3">Nobody away.</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto pr-1 text-sm">
                {exp.awayStudents.map((s) => (
                  <li key={s.studentId} className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-ink-2">{s.fullName}</span>
                    <span className="shrink-0 text-xs text-ink-3">
                      {s.expectedReturnDate ? `back ${formatDayShort(s.expectedReturnDate)}` : "return not given"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {record && (
          <div className="space-y-3 rounded-xl border border-line bg-card-2/40 p-4">
            <DetailList
              items={[
                { label: "Served", value: <span className="tabular text-lg font-semibold">{record.servedCount}</span> },
                { label: "Leftover portions", value: <span className="tabular text-lg font-semibold">{formatNumber(toNumber(record.leftoverPortions))}</span> },
                { label: "Expected when recorded", value: <span className="tabular">{record.expectedCount}</span> },
                {
                  label: "Attendance",
                  value: meal!.attendances.length ? `${attendedCount} of ${meal!.attendances.length} ticked` : "Not tracked",
                },
                { label: "Notes", value: record.notes || "—" },
                { label: "Recorded", value: `${record.recordedBy?.name ?? "—"} · ${formatDateTime(record.updatedAt)}` },
              ]}
            />
            {canRecord && (
              <Dialog
                trigger={
                  <>
                    <Pencil className="h-3.5 w-3.5" /> Edit record
                  </>
                }
                triggerSize="sm"
                title={`Edit ${title.toLowerCase()} record — ${formatDayShort(date)}`}
                wide
              >
                {recordForm}
              </Dialog>
            )}
          </div>
        )}

        {!record && canRecord && meal && (
          <div className="border-t border-line pt-4">
            <h3 className="mb-3 text-sm font-medium text-ink">Record meal</h3>
            {isFuture ? <p className="text-sm text-ink-3">You can record this meal once it has been served.</p> : recordForm}
          </div>
        )}
      </div>
    </Card>
  );
}
