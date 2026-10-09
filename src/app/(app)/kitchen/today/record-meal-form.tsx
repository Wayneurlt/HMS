"use client";

import { useState } from "react";
import { ActionForm, Field, FormActions, FormGrid, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { recordMeal } from "./actions";

export type ChecklistStudent = { studentId: string; fullName: string; where?: string; away?: boolean };

export function RecordMealForm({
  mealId,
  initial,
  students,
  attendance,
}: {
  mealId: string;
  initial?: { servedCount: number; leftoverPortions: number; notes: string };
  students: ChecklistStudent[];
  /** Existing attendance ticks (studentId → attended). Empty when none recorded. */
  attendance: Record<string, boolean>;
}) {
  const hasAttendance = Object.keys(attendance).length > 0;
  const [track, setTrack] = useState(hasAttendance);
  const [ticked, setTicked] = useState<Set<string>>(
    () =>
      new Set(
        hasAttendance
          ? Object.entries(attendance).filter(([, v]) => v).map(([k]) => k)
          : students.filter((s) => !s.away).map((s) => s.studentId),
      ),
  );
  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ActionForm action={recordMeal} resetOnSuccess={false}>
      <input type="hidden" name="mealId" value={mealId} />
      <FormGrid cols={2}>
        <Field
          label="Served"
          name="servedCount"
          hint={track ? `Leave blank to use the ticked count (${ticked.size})` : "Number of plates served"}
        >
          <Input name="servedCount" type="number" inputMode="numeric" min={0} step={1} defaultValue={initial?.servedCount} />
        </Field>
        <Field label="Leftover portions" name="leftoverPortions" hint="Use halves if needed, e.g. 2.5">
          <Input
            name="leftoverPortions"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            defaultValue={initial?.leftoverPortions ?? 0}
          />
        </Field>
      </FormGrid>
      <Field label="Notes" name="notes" hint="Optional">
        <Textarea name="notes" rows={2} maxLength={500} defaultValue={initial?.notes} />
      </Field>

      {students.length > 0 && (
        <div className="rounded-xl border border-line bg-card-2/40 p-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              name="trackAttendance"
              checked={track}
              onChange={(e) => setTrack(e.target.checked)}
              className="h-4 w-4 rounded border-line-2 bg-card-2 accent-(--color-accent)"
            />
            Record who ate (attendance checklist)
          </label>
          {track && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
                <span>
                  <b className="tabular text-ink">{ticked.size}</b> of {students.length} ticked
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    className="rounded-full px-2 py-1 hover:bg-card-3 hover:text-ink"
                    onClick={() => setTicked(new Set(students.map((s) => s.studentId)))}
                  >
                    Tick all
                  </button>
                  <button type="button" className="rounded-full px-2 py-1 hover:bg-card-3 hover:text-ink" onClick={() => setTicked(new Set())}>
                    Clear
                  </button>
                </span>
              </div>
              <ul className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                {students.map((s) => (
                  <li key={s.studentId}>
                    <input type="hidden" name="listed[]" value={s.studentId} />
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-card-3",
                        ticked.has(s.studentId) ? "text-ink" : "text-ink-3",
                      )}
                    >
                      <input
                        type="checkbox"
                        name="present[]"
                        value={s.studentId}
                        checked={ticked.has(s.studentId)}
                        onChange={() => toggle(s.studentId)}
                        className="h-4 w-4 shrink-0 rounded border-line-2 bg-card-2 accent-(--color-accent)"
                      />
                      <span className="min-w-0 truncate">
                        {s.fullName}
                        <span className="ml-1.5 text-xs text-ink-3">
                          {[s.where, s.away ? "marked away" : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <FormActions>
        <SubmitButton>{initial ? "Update record" : "Save record"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
