"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ActionForm, Field, FormActions, FormGrid, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { buttonClass, type ButtonVariant } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { bulkSetOvernight, setOvernightStatus } from "./actions";

type Answer = "STAYING" | "AWAY" | "NOT_RESPONDED";

/** Edit one student's answer for one night. */
export function OvernightEditForm({
  studentId,
  date,
  initial,
}: {
  studentId: string;
  /** YYYY-MM-DD */
  date: string;
  initial: { status: Answer; expectedReturnDate: string; note: string };
}) {
  const [status, setStatus] = useState<string>(initial.status === "NOT_RESPONDED" ? "AWAY" : initial.status);
  return (
    <ActionForm action={setOvernightStatus} resetOnSuccess={false}>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="date" value={date} />
      <Field label="Answer" name="status" required>
        <Select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "STAYING", label: "Staying at the hostel" },
            { value: "AWAY", label: "Away for the night" },
          ]}
        />
      </Field>
      {status === "AWAY" && (
        <Field label="Expected return" name="expectedReturnDate" hint="Optional">
          <Input name="expectedReturnDate" type="date" defaultValue={initial.expectedReturnDate} />
        </Field>
      )}
      <Field label="Note" name="note" hint="Optional, e.g. visiting family">
        <Textarea name="note" rows={2} maxLength={300} defaultValue={initial.note} />
      </Field>
      <FormActions>
        <SubmitButton>Save answer</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

/** One-click answer change (mark staying / clear). */
export function QuickOvernightButton({
  studentId,
  date,
  status,
  children,
  variant = "ghost",
  title,
  icon,
}: {
  studentId: string;
  date: string;
  status: "STAYING" | "CLEAR";
  children: ReactNode;
  variant?: ButtonVariant;
  title?: string;
  /** Square icon-only button. */
  icon?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <button
      type="button"
      title={title}
      disabled={pending}
      className={buttonClass(variant, icon ? "icon" : "sm", icon ? "h-8 w-8" : undefined)}
      onClick={() =>
        start(async () => {
          const res = await setOvernightStatus({ studentId, date, status });
          if (res.ok) {
            toast("success", res.message ?? "Saved");
            router.refresh();
          } else {
            toast("error", res.error);
          }
        })
      }
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {pending && icon ? null : children}
    </button>
  );
}

/** Mark a student away/staying for a range of nights. */
export function BulkOvernightForm({
  students,
  defaultFrom,
}: {
  students: { id: string; label: string }[];
  defaultFrom: string;
}) {
  const [status, setStatus] = useState("AWAY");
  return (
    <ActionForm action={bulkSetOvernight}>
      <Field label="Student" name="studentId" required>
        <Select name="studentId" placeholder="Select a student" options={students.map((s) => ({ value: s.id, label: s.label }))} />
      </Field>
      <FormGrid cols={2}>
        <Field label="First night" name="from" required>
          <Input name="from" type="date" defaultValue={defaultFrom} />
        </Field>
        <Field label="Last night" name="to" required hint="Up to 60 nights">
          <Input name="to" type="date" defaultValue={defaultFrom} />
        </Field>
      </FormGrid>
      <FormGrid cols={2}>
        <Field label="Answer" name="status" required>
          <Select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "AWAY", label: "Away" },
              { value: "STAYING", label: "Staying" },
            ]}
          />
        </Field>
        {status === "AWAY" && (
          <Field label="Expected return" name="expectedReturnDate" hint="Defaults to the day after the last night">
            <Input name="expectedReturnDate" type="date" />
          </Field>
        )}
      </FormGrid>
      <Field label="Note" name="note" hint="Optional">
        <Textarea name="note" rows={2} maxLength={300} />
      </Field>
      <p className="text-xs text-ink-3">
        Existing answers in the range are replaced. Nights on which the student is not a resident are skipped.
      </p>
      <FormActions>
        <SubmitButton>Apply to range</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
