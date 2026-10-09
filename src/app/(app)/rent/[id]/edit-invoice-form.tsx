"use client";

import { ActionForm, Field, FormActions, FormGrid, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { formatMoney } from "@/lib/format";
import { editInvoiceAction } from "../actions";

export function EditInvoiceForm({
  invoice,
}: {
  invoice: { id: string; amountDue: number; amountPaid: number; dueDate: string; notes: string | null };
}) {
  return (
    <ActionForm action={editInvoiceAction} resetOnSuccess={false}>
      <input type="hidden" name="id" value={invoice.id} />
      <FormGrid>
        <Field
          label="Amount due"
          name="amountDue"
          required
          hint={invoice.amountPaid > 0 ? `At least ${formatMoney(invoice.amountPaid)} (already paid)` : undefined}
        >
          <Input
            name="amountDue"
            type="number"
            inputMode="decimal"
            min={invoice.amountPaid || 0.01}
            step="0.01"
            defaultValue={invoice.amountDue}
          />
        </Field>
        <Field label="Due date" name="dueDate" required>
          <Input name="dueDate" type="date" defaultValue={invoice.dueDate} />
        </Field>
      </FormGrid>
      <Field label="Notes" name="notes" hint="Optional, e.g. why the amount was adjusted">
        <Textarea name="notes" rows={3} maxLength={1000} defaultValue={invoice.notes ?? ""} />
      </Field>
      <FormActions>
        <SubmitButton>Save changes</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
