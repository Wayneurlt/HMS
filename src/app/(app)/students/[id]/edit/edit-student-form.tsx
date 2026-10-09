"use client";

import { ActionForm, FormActions, SubmitButton } from "@/components/ui/form";
import { LinkButton } from "@/components/ui/primitives";
import { updateStudent } from "../../actions";
import { PersonalFields, RentFields, Step, type PersonalValues } from "../../student-fields";

export function EditStudentForm({
  id,
  initial,
  monthlyRent,
  rentDueDay,
  hasStay,
}: {
  id: string;
  initial: PersonalValues;
  monthlyRent: number;
  rentDueDay: number;
  hasStay: boolean;
}) {
  return (
    <ActionForm action={updateStudent} resetOnSuccess={false} redirectTo={`/students/${id}`}>
      <input type="hidden" name="id" value={id} />
      <div className="space-y-5">
        <Step title="Personal details">
          <PersonalFields initial={initial} />
        </Step>
        <Step
          title="Rent terms"
          hint="Changes apply to rent generated from now on. Existing rent records keep their amounts and due dates — adjust those on the Rent page if needed."
        >
          <RentFields
            monthlyRent={monthlyRent}
            rentDueDay={rentDueDay}
            rentHint={hasStay ? "Also updates the current stay (future invoices only)" : "Used at the next check-in"}
          />
        </Step>
        <FormActions>
          <LinkButton href={`/students/${id}`} variant="ghost">
            Cancel
          </LinkButton>
          <SubmitButton>Save changes</SubmitButton>
        </FormActions>
      </div>
    </ActionForm>
  );
}
