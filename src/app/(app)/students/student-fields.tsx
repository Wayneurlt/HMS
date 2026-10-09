"use client";

import type { ReactNode } from "react";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";

export type PersonalValues = {
  fullName: string;
  phone: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  idNumber: string;
  notes: string;
};

/** Numbered section used by the check-in workflow and edit form. */
export function Step({ n, title, hint, children }: { n?: number; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-card p-5">
      <header className="mb-4 flex items-start gap-3">
        {n !== undefined && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-lo text-xs font-semibold text-accent-hi tabular">
            {n}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function PersonalFields({ initial }: { initial?: Partial<PersonalValues> }) {
  return (
    <>
      <FormGrid>
        <Field label="Full name" name="fullName" required>
          <Input name="fullName" defaultValue={initial?.fullName} maxLength={120} autoComplete="off" />
        </Field>
        <Field label="Phone" name="phone" required>
          <Input name="phone" type="tel" defaultValue={initial?.phone} placeholder="0712345678" maxLength={20} />
        </Field>
        <Field label="Email" name="email" hint="Optional">
          <Input name="email" type="email" defaultValue={initial?.email} maxLength={200} />
        </Field>
        <Field label="ID / passport number" name="idNumber" hint="Optional">
          <Input name="idNumber" defaultValue={initial?.idNumber} maxLength={40} />
        </Field>
        <Field label="Emergency contact name" name="emergencyContactName" hint="Optional">
          <Input name="emergencyContactName" defaultValue={initial?.emergencyContactName} maxLength={120} />
        </Field>
        <Field label="Emergency contact phone" name="emergencyContactPhone" hint="Optional">
          <Input name="emergencyContactPhone" type="tel" defaultValue={initial?.emergencyContactPhone} maxLength={20} />
        </Field>
      </FormGrid>
      <Field label="Notes" name="notes" hint="Optional, internal only">
        <Textarea name="notes" defaultValue={initial?.notes} rows={3} maxLength={1000} />
      </Field>
    </>
  );
}

export const DUE_DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Day ${i + 1}` }));

export function RentFields({ monthlyRent, rentDueDay, rentHint }: { monthlyRent: number; rentDueDay: number; rentHint?: ReactNode }) {
  return (
    <FormGrid>
      <Field label="Monthly rent (KES)" name="monthlyRent" required hint={rentHint}>
        <Input name="monthlyRent" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={monthlyRent} />
      </Field>
      <Field label="Rent due day" name="rentDueDay" required hint="Day of each month rent is due (1–28)">
        <Select name="rentDueDay" defaultValue={String(rentDueDay)} options={DUE_DAY_OPTIONS} />
      </Field>
    </FormGrid>
  );
}
