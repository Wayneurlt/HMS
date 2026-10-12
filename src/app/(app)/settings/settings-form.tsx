"use client";

import { ActionForm, Checkbox, Field, FormActions, FormGrid, Input, SubmitButton } from "@/components/ui/form";
import { updateSettings } from "./actions";

export type SettingsValues = {
  address: string;
  phone: string;
  email: string;
  defaultMonthlyRent: number;
  defaultRentDueDay: number;
  prorateFirstMonth: boolean;
  breakfastTime: string;
  dinnerTime: string;
};

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  return (
    <ActionForm action={updateSettings} resetOnSuccess={false}>
      <h3 className="text-xs font-medium uppercase tracking-wide text-ink-3">Hostel</h3>
      <Field label="Address" name="address">
        <Input name="address" defaultValue={initial.address} maxLength={300} />
      </Field>
      <FormGrid>
        <Field label="Phone" name="phone">
          <Input name="phone" type="tel" defaultValue={initial.phone} placeholder="0712345678" />
        </Field>
        <Field label="Email" name="email">
          <Input name="email" type="email" defaultValue={initial.email} maxLength={200} />
        </Field>
      </FormGrid>

      <h3 className="pt-2 text-xs font-medium uppercase tracking-wide text-ink-3">Rent defaults</h3>
      <FormGrid>
        <Field label="Default monthly rent (KES)" name="defaultMonthlyRent" required hint="Pre-filled when checking in new students.">
          <Input name="defaultMonthlyRent" type="number" min={1} step="0.01" inputMode="decimal" defaultValue={initial.defaultMonthlyRent} />
        </Field>
        <Field label="Default rent due day" name="defaultRentDueDay" required hint="Day of the month, 1–28.">
          <Input name="defaultRentDueDay" type="number" min={1} max={28} step={1} defaultValue={initial.defaultRentDueDay} />
        </Field>
      </FormGrid>
      <Field label="First month" name="prorateFirstMonth" hint="When on, a student moving in mid-month pays only for the days stayed.">
        <Checkbox name="prorateFirstMonth" label="Prorate the first month's rent" defaultChecked={initial.prorateFirstMonth} />
      </Field>

      <h3 className="pt-2 text-xs font-medium uppercase tracking-wide text-ink-3">Meal times</h3>
      <FormGrid>
        <Field label="Breakfast" name="breakfastTime" required>
          <Input name="breakfastTime" type="time" defaultValue={initial.breakfastTime} />
        </Field>
        <Field label="Dinner" name="dinnerTime" required>
          <Input name="dinnerTime" type="time" defaultValue={initial.dinnerTime} />
        </Field>
      </FormGrid>

      <FormActions>
        <SubmitButton>Save settings</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
