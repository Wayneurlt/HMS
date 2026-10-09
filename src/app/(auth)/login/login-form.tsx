"use client";

import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { loginAction } from "../actions";

export function LoginForm() {
  return (
    <ActionForm
      action={loginAction}
      successMessage="Signed in"
      resetOnSuccess={false}
      redirectTo={(d) => d?.redirect ?? "/"}
    >
      <Field label="Email or phone" name="identifier">
        <Input name="identifier" autoComplete="username" placeholder="you@example.com or 0712345678" required autoFocus />
      </Field>
      <Field label="Password" name="password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" size="lg">
        Sign in
      </SubmitButton>
      <p className="text-center text-xs text-ink-3">Forgot your password? Ask the hostel owner or manager to reset it.</p>
    </ActionForm>
  );
}
