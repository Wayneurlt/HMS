"use client";

import { ActionForm, Field, FormActions, FormGrid, Input, Select, SubmitButton } from "@/components/ui/form";
import { Callout } from "@/components/ui/primitives";
import { changeStudentBed, createStudentLogin, resetStudentPassword } from "../actions";

export function ChangeBedForm({
  studentId,
  current,
  beds,
  defaultDate,
  minDate,
}: {
  studentId: string;
  current: string;
  beds: { value: string; label: string }[];
  defaultDate: string;
  minDate: string;
}) {
  if (beds.length === 0) {
    return <Callout tone="warn">There are no free beds right now. Free or add a bed on the Rooms page first.</Callout>;
  }
  return (
    <ActionForm action={changeStudentBed}>
      <input type="hidden" name="id" value={studentId} />
      <p className="text-sm text-ink-2">
        Currently in <span className="text-ink">{current}</span>. Rent stays the same; the old bed becomes available.
      </p>
      <FormGrid>
        <Field label="New bed" name="newBedId" required>
          <Select name="newBedId" options={beds} placeholder="Choose a bed…" defaultValue="" />
        </Field>
        <Field label="Effective date" name="effectiveDate" required>
          <Input name="effectiveDate" type="date" defaultValue={defaultDate} min={minDate} />
        </Field>
      </FormGrid>
      <FormActions>
        <SubmitButton>Move student</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function CreateLoginForm({ studentId, suggestion }: { studentId: string; suggestion: string }) {
  return (
    <ActionForm action={createStudentLogin}>
      <input type="hidden" name="id" value={studentId} />
      <Field label="Login email or phone" name="loginIdentifier" required>
        <Input name="loginIdentifier" defaultValue={suggestion} maxLength={200} autoComplete="off" />
      </Field>
      <Field
        label="Temporary password"
        name="loginPassword"
        required
        hint="At least 8 characters with a letter and a number. The student must change it at first sign-in."
      >
        <Input name="loginPassword" type="text" maxLength={128} autoComplete="new-password" />
      </Field>
      <FormActions>
        <SubmitButton>Create login</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function ResetPasswordForm({ studentId, login }: { studentId: string; login: string }) {
  return (
    <ActionForm action={resetStudentPassword}>
      <input type="hidden" name="id" value={studentId} />
      <p className="text-sm text-ink-2">
        Signs the student out everywhere. They sign in as <span className="text-ink">{login}</span> with the new password
        and must change it.
      </p>
      <Field label="New temporary password" name="loginPassword" required hint="At least 8 characters with a letter and a number.">
        <Input name="loginPassword" type="text" maxLength={128} autoComplete="new-password" />
      </Field>
      <FormActions>
        <SubmitButton>Reset password</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
