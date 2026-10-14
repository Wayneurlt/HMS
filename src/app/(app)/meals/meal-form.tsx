"use client";

import { ActionForm, Field, FormActions, FormGrid, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { saveMeal } from "./actions";

export type MealFormValues = {
  id?: string;
  /** YYYY-MM-DD */
  date: string;
  type: "BREAKFAST" | "LUNCH" | "DINNER";
  menu?: string;
  notes?: string;
};

export function MealForm({ initial, lockSlot }: { initial: MealFormValues; lockSlot?: boolean }) {
  return (
    <ActionForm action={saveMeal} resetOnSuccess={!initial.id}>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {lockSlot ? (
        <>
          <input type="hidden" name="date" value={initial.date} />
          <input type="hidden" name="type" value={initial.type} />
        </>
      ) : (
        <FormGrid cols={2}>
          <Field label="Date" name="date" required>
            <Input name="date" type="date" defaultValue={initial.date} />
          </Field>
          <Field label="Meal" name="type" required hint="Lunch is served on Saturdays and Sundays">
            <Select
              name="type"
              defaultValue={initial.type}
              options={[
                { value: "BREAKFAST", label: "Breakfast" },
                { value: "LUNCH", label: "Lunch (weekends)" },
                { value: "DINNER", label: "Dinner" },
              ]}
            />
          </Field>
        </FormGrid>
      )}
      <Field label="Menu" name="menu" required>
        <Textarea name="menu" rows={2} maxLength={500} defaultValue={initial.menu} placeholder="e.g. Rice, beef stew, cabbage" />
      </Field>
      <Field label="Notes" name="notes" hint="Optional, e.g. vegetarian option available">
        <Textarea name="notes" rows={2} maxLength={500} defaultValue={initial.notes} />
      </Field>
      <FormActions>
        <SubmitButton>{initial.id ? "Save changes" : "Add meal"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
