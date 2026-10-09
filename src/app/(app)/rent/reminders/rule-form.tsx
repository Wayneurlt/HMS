"use client";

import { useState } from "react";
import { ActionForm, Checkbox, Field, FormActions, FormGrid, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { createReminderRule, updateReminderRule } from "../actions";
import { offsetLabel, PLACEHOLDERS } from "./shared";

export type RuleFormValues = {
  id: string;
  name: string;
  offsetDays: number;
  channel: string;
  template: string;
  isActive: boolean;
};

/** Mirrors renderTemplate() in services/reminders (pure string substitution). */
function render(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

const CHANNEL_OPTIONS = [
  { value: "IN_APP", label: "In-app notification" },
  { value: "SMS", label: "SMS" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
];

export function RuleForm({
  initial,
  sampleVars,
  providerConfigured,
}: {
  initial?: RuleFormValues;
  sampleVars: Record<string, string>;
  providerConfigured: boolean;
}) {
  const [template, setTemplate] = useState(initial?.template ?? "Hi {name}, your {month} rent of {outstanding} at {hostel} is due on {dueDate}.");
  const [offset, setOffset] = useState(String(initial?.offsetDays ?? -3));
  const [channel, setChannel] = useState(initial?.channel ?? "IN_APP");
  const offsetNum = Number(offset);
  const unknown = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((k) => !(PLACEHOLDERS as readonly string[]).includes(k));

  return (
    <ActionForm action={initial ? updateReminderRule : createReminderRule} resetOnSuccess={!initial}>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <FormGrid>
        <Field label="Name" name="name" required>
          <Input name="name" maxLength={80} defaultValue={initial?.name} placeholder="e.g. 3 days before due date" />
        </Field>
        <Field
          label="Offset (days)"
          name="offsetDays"
          required
          hint={Number.isInteger(offsetNum) && offset !== "" ? offsetLabel(offsetNum) : "Negative = before, 0 = on, positive = after"}
        >
          <Input
            name="offsetDays"
            type="number"
            min={-30}
            max={60}
            step={1}
            value={offset}
            onChange={(e) => setOffset(e.target.value)}
          />
        </Field>
      </FormGrid>
      <Field
        label="Channel"
        name="channel"
        hint={
          channel !== "IN_APP" && !providerConfigured
            ? "No messaging provider is configured (MESSAGING_PROVIDER), so these reminders will be logged as Skipped."
            : undefined
        }
      >
        <Select name="channel" value={channel} onChange={(e) => setChannel(e.target.value)} options={CHANNEL_OPTIONS} />
      </Field>
      <Field
        label="Message template"
        name="template"
        required
        hint={
          unknown.length
            ? `Unknown placeholder${unknown.length > 1 ? "s" : ""}: ${unknown.map((u) => `{${u}}`).join(", ")} (will be sent as typed)`
            : `Placeholders: ${PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}`
        }
      >
        <Textarea name="template" rows={4} maxLength={1000} value={template} onChange={(e) => setTemplate(e.target.value)} />
      </Field>
      <div className="rounded-xl border border-line bg-card-2 px-4 py-3">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">Preview</div>
        <p className="whitespace-pre-wrap text-sm text-ink">{render(template, sampleVars) || "—"}</p>
      </div>
      <Checkbox name="isActive" label="Active" defaultChecked={initial?.isActive ?? true} />
      <FormActions>
        <SubmitButton>{initial ? "Save rule" : "Create rule"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
