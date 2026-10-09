"use client";

import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { changePasswordAction } from "@/app/(auth)/actions";

export function ChangePasswordForm() {
  return (
    <ActionForm action={changePasswordAction}>
      <Field label="Current password" name="current" required>
        <Input name="current" type="password" autoComplete="current-password" />
      </Field>
      <Field label="New password" name="password" required hint="8+ characters with a number">
        <Input name="password" type="password" autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password" name="confirm" required>
        <Input name="confirm" type="password" autoComplete="new-password" />
      </Field>
      <SubmitButton>Update password</SubmitButton>
    </ActionForm>
  );
}
