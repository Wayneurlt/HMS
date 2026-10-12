"use client";

import { ActionForm, Field, FormGrid, Input, SubmitButton } from "@/components/ui/form";
import { setupOwnerAction } from "../actions";

export function SetupForm() {
  return (
    <ActionForm action={setupOwnerAction} resetOnSuccess={false} redirectTo={(d) => d?.redirect ?? "/dashboard"}>
      <Field label="Your full name" name="name" required>
        <Input name="name" autoComplete="name" />
      </Field>
      <FormGrid>
        <Field label="Email" name="email" required>
          <Input name="email" type="email" autoComplete="email" />
        </Field>
        <Field label="Phone" name="phone">
          <Input name="phone" type="tel" autoComplete="tel" placeholder="0712345678" />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="Password" name="password" required hint="8+ characters with a number">
          <Input name="password" type="password" autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" name="confirm" required>
          <Input name="confirm" type="password" autoComplete="new-password" />
        </Field>
      </FormGrid>
      <SubmitButton className="w-full" size="lg">
        Create owner account
      </SubmitButton>
    </ActionForm>
  );
}
