"use client";

import { useMemo, useState } from "react";
import { ActionForm, Field, FormActions, FormGrid, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { formatMoney, round2 } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { editPaymentAction, recordPaymentAction } from "./actions";

export type PayableInvoice = {
  id: string;
  studentId: string;
  studentName: string;
  monthLabel: string;
  /** "YYYY-MM-DD" */
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  outstanding: number;
};

export const METHOD_OPTIONS = [
  { value: "MPESA", label: "M-Pesa" },
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank" },
  { value: "OTHER", label: "Other" },
];

function refHint(method: string) {
  if (method === "MPESA") return "M-Pesa transaction code (required)";
  if (method === "BANK") return "Bank slip / transfer reference (required)";
  return "Optional";
}

function Preview({ due, paidBefore, amount }: { due: number; paidBefore: number; amount: number }) {
  const valid = Number.isFinite(amount) && amount > 0;
  const paidAfter = round2(paidBefore + (valid ? amount : 0));
  const outstandingAfter = round2(due - paidAfter);
  const over = outstandingAfter < 0;
  return (
    <div className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-card-2 p-3 text-center">
      <div>
        <div className="text-[11px] text-ink-3">Amount due</div>
        <div className="tabular text-sm font-medium text-ink">{formatMoney(due)}</div>
      </div>
      <div>
        <div className="text-[11px] text-ink-3">Paid after</div>
        <div className="tabular text-sm font-medium text-good">{formatMoney(paidAfter)}</div>
      </div>
      <div>
        <div className="text-[11px] text-ink-3">Outstanding after</div>
        <div className={cn("tabular text-sm font-medium", over ? "text-bad" : outstandingAfter > 0 ? "text-warn" : "text-good")}>
          {over ? "Too much" : formatMoney(outstandingAfter)}
        </div>
      </div>
    </div>
  );
}

/**
 * Record a payment. With `preselectedId` the invoice is fixed; otherwise the user picks a
 * student and then one of their unpaid invoices (oldest first).
 */
export function RecordPaymentForm({
  invoices,
  preselectedId,
  today,
}: {
  invoices: PayableInvoice[];
  preselectedId?: string;
  today: string;
}) {
  const fixed = preselectedId ? invoices.find((i) => i.id === preselectedId) : undefined;
  const students = useMemo(() => {
    const m = new Map<string, { name: string; total: number }>();
    for (const inv of invoices) {
      const s = m.get(inv.studentId) ?? { name: inv.studentName, total: 0 };
      s.total = round2(s.total + inv.outstanding);
      m.set(inv.studentId, s);
    }
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [invoices]);

  const [studentId, setStudentId] = useState(fixed?.studentId ?? "");
  const studentInvoices = invoices.filter((i) => i.studentId === studentId);
  const [invoiceId, setInvoiceId] = useState(fixed?.id ?? "");
  const invoice = fixed ?? invoices.find((i) => i.id === invoiceId);
  const [amount, setAmount] = useState(invoice ? String(invoice.outstanding) : "");
  const [method, setMethod] = useState("MPESA");

  const pickInvoice = (id: string) => {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    setAmount(inv ? String(inv.outstanding) : "");
  };

  if (preselectedId && !fixed) {
    return <p className="text-sm text-ink-2">This rent record has no outstanding balance.</p>;
  }
  if (!fixed && invoices.length === 0) {
    return <p className="text-sm text-ink-2">There are no unpaid rent records. Everyone is up to date.</p>;
  }

  return (
    <ActionForm action={recordPaymentAction}>
      {fixed ? (
        <div className="rounded-xl border border-line bg-card-2 px-4 py-3 text-sm">
          <div className="font-medium text-ink">{fixed.studentName}</div>
          <div className="text-xs text-ink-2">
            {fixed.monthLabel} rent · due {formatDate(fixed.dueDate)}
          </div>
        </div>
      ) : (
        <FormGrid>
          <Field label="Student" name="studentId" required>
            <Select
              name="studentId"
              value={studentId}
              onChange={(e) => {
                const sid = e.target.value;
                setStudentId(sid);
                const first = invoices.find((i) => i.studentId === sid);
                pickInvoice(first?.id ?? "");
              }}
              placeholder="Choose a student"
              options={students.map(([id, s]) => ({ value: id, label: `${s.name} (${formatMoney(s.total)})` }))}
            />
          </Field>
          <Field label="Rent month" name="invoiceId" required>
            <Select
              name="invoiceId"
              value={invoiceId}
              onChange={(e) => pickInvoice(e.target.value)}
              disabled={!studentId}
              placeholder={studentId ? "Choose a month" : "Choose a student first"}
              options={studentInvoices.map((i) => ({
                value: i.id,
                label: `${i.monthLabel} · ${formatMoney(i.outstanding)} outstanding`,
              }))}
            />
          </Field>
        </FormGrid>
      )}
      {fixed && <input type="hidden" name="invoiceId" value={fixed.id} />}

      <FormGrid>
        <Field
          label="Amount"
          name="amount"
          required
          hint={invoice ? `Maximum ${formatMoney(invoice.outstanding)}` : undefined}
        >
          <Input
            name="amount"
            type="number"
            inputMode="decimal"
            min={0.01}
            step="0.01"
            max={invoice?.outstanding}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Payment date" name="paidAt" required>
          <Input name="paidAt" type="date" defaultValue={today} max={today} />
        </Field>
        <Field label="Method" name="method" required>
          <Select name="method" value={method} onChange={(e) => setMethod(e.target.value)} options={METHOD_OPTIONS} />
        </Field>
        <Field label="Reference / transaction no." name="reference" hint={refHint(method)} required={method === "MPESA" || method === "BANK"}>
          <Input
            name="reference"
            maxLength={100}
            autoComplete="off"
            className="uppercase"
            placeholder={method === "MPESA" ? "e.g. SJK4H2L9QX" : undefined}
          />
        </Field>
      </FormGrid>
      <Field label="Notes" name="notes" hint="Optional">
        <Textarea name="notes" rows={2} maxLength={500} />
      </Field>

      {invoice && <Preview due={invoice.amountDue} paidBefore={invoice.amountPaid} amount={Number(amount)} />}

      <FormActions>
        <SubmitButton>Record payment</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export type EditablePayment = {
  id: string;
  amount: number;
  paidAt: string;
  method: string;
  reference: string | null;
  notes: string | null;
};

/** Owner-only payment correction. `maxAmount` = amount due − other payments. */
export function EditPaymentForm({
  payment,
  maxAmount,
  amountDue,
  today,
}: {
  payment: EditablePayment;
  maxAmount: number;
  amountDue: number;
  today: string;
}) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState(payment.method);
  const paidByOthers = round2(amountDue - maxAmount);
  return (
    <ActionForm action={editPaymentAction} resetOnSuccess={false}>
      <input type="hidden" name="id" value={payment.id} />
      <FormGrid>
        <Field label="Amount" name="amount" required hint={`Maximum ${formatMoney(maxAmount)}`}>
          <Input
            name="amount"
            type="number"
            inputMode="decimal"
            min={0.01}
            step="0.01"
            max={maxAmount}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Payment date" name="paidAt" required>
          <Input name="paidAt" type="date" defaultValue={payment.paidAt} max={today} />
        </Field>
        <Field label="Method" name="method" required>
          <Select name="method" value={method} onChange={(e) => setMethod(e.target.value)} options={METHOD_OPTIONS} />
        </Field>
        <Field label="Reference / transaction no." name="reference" hint={refHint(method)} required={method === "MPESA" || method === "BANK"}>
          <Input name="reference" maxLength={100} autoComplete="off" className="uppercase" defaultValue={payment.reference ?? ""} />
        </Field>
      </FormGrid>
      <Field label="Notes" name="notes" hint="Optional">
        <Textarea name="notes" rows={2} maxLength={500} defaultValue={payment.notes ?? ""} />
      </Field>
      <Preview due={amountDue} paidBefore={paidByOthers} amount={Number(amount)} />
      <FormActions>
        <SubmitButton>Save changes</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
