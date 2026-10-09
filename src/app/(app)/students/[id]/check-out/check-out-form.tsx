"use client";

import { LogOut } from "lucide-react";
import { ActionForm, Field, FormActions, Input, SubmitButton, Textarea, useFormErrors } from "@/components/ui/form";
import { LinkButton } from "@/components/ui/primitives";
import { checkOut } from "../../actions";

function ConfirmBox({ name }: { name: string }) {
  const { errors } = useFormErrors();
  return (
    <div className="space-y-1.5">
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
        <input type="checkbox" name="confirm" className="mt-0.5 h-4 w-4 shrink-0 accent-(--color-accent)" />
        <span>
          I confirm that {name} is moving out, the bed has been inspected and any keys have been returned.
        </span>
      </label>
      {errors.confirm?.[0] && (
        <p className="text-xs text-bad" role="alert">
          {errors.confirm[0]}
        </p>
      )}
    </div>
  );
}

export function CheckOutForm({
  studentId,
  studentName,
  defaultDate,
  minDate,
}: {
  studentId: string;
  studentName: string;
  defaultDate: string;
  minDate: string;
}) {
  return (
    <ActionForm action={checkOut} resetOnSuccess={false} redirectTo={`/students/${studentId}`}>
      <input type="hidden" name="id" value={studentId} />
      <Field label="Move-out date" name="moveOutDate" required hint="The last night stayed is the night before this date.">
        <Input name="moveOutDate" type="date" defaultValue={defaultDate} min={minDate} className="sm:max-w-xs" />
      </Field>
      <Field label="Notes" name="notes" hint="Optional, e.g. condition of the bed, deposit, forwarding contact">
        <Textarea name="notes" rows={3} maxLength={1000} />
      </Field>
      <ConfirmBox name={studentName} />
      <FormActions>
        <LinkButton href={`/students/${studentId}`} variant="ghost">
          Cancel
        </LinkButton>
        <SubmitButton variant="danger">
          <LogOut className="h-4 w-4" /> Check out
        </SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
