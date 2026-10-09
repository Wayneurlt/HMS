"use client";

import { ActionForm, Field, FormActions, FormGrid, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, toOptions } from "../constants";
import { recordExpense } from "./actions";

export function ExpenseForm({ todayISO }: { todayISO: string }) {
  return (
    <ActionForm action={recordExpense}>
      <FormGrid>
        <Field label="Category" name="category" required>
          <Select name="category" defaultValue="FOOD" options={toOptions(EXPENSE_CATEGORIES)} />
        </Field>
        <Field label="Amount (KES)" name="amount" required>
          <Input name="amount" type="number" step="0.01" min={0} inputMode="decimal" />
        </Field>
      </FormGrid>
      <Field label="Description" name="description" required>
        <Input name="description" maxLength={200} placeholder="e.g. Gas refill 13kg" />
      </Field>
      <FormGrid cols={3}>
        <Field label="Date" name="expenseDate" required>
          <Input name="expenseDate" type="date" defaultValue={todayISO} max={todayISO} />
        </Field>
        <Field label="Paid via" name="paymentMethod" required>
          <Select name="paymentMethod" defaultValue="MPESA" options={toOptions(PAYMENT_METHODS)} />
        </Field>
        <Field label="Receipt / reference" name="reference">
          <Input name="reference" maxLength={100} />
        </Field>
      </FormGrid>
      <Field label="Notes" name="notes">
        <Textarea name="notes" rows={2} maxLength={1000} />
      </Field>
      <FormActions>
        <SubmitButton>Record expense</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
