import { CreditCard, Receipt, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireStudentSelf } from "@/lib/auth/guards";
import { formatDate, formatMonth, today } from "@/lib/dates";
import { formatMoney, label, round2, toNumber } from "@/lib/format";
import { computeRentStatus, studentOutstanding } from "@/lib/services/rent";
import { Callout, Card, EmptyState, PageHeader, StatCard, Table, TD, TH, THead } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";

export const metadata = { title: "My rent" };

export default async function MyRentPage() {
  const user = await requireStudentSelf();
  const studentId = user.studentId;
  const t = today();

  const [invoices, payments, outstanding] = await Promise.all([
    db.rentInvoice.findMany({
      where: { studentId, voidedAt: null },
      orderBy: { periodMonth: "desc" },
      select: { id: true, periodMonth: true, amountDue: true, amountPaid: true, dueDate: true },
    }),
    db.rentPayment.findMany({
      where: { studentId, voidedAt: null, invoice: { voidedAt: null } },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, amount: true, paidAt: true, method: true, reference: true, invoice: { select: { periodMonth: true } } },
    }),
    studentOutstanding(studentId),
  ]);

  const rows = invoices.map((i) => {
    const due = toNumber(i.amountDue);
    const paid = toNumber(i.amountPaid);
    return {
      id: i.id,
      month: i.periodMonth,
      due,
      paid,
      outstanding: round2(due - paid),
      dueDate: i.dueDate,
      status: computeRentStatus(due, paid, i.dueDate, t),
    };
  });
  const totalPaid = round2(payments.reduce((s, p) => s + toNumber(p.amount), 0));
  const overdue = rows.filter((r) => r.status === "OVERDUE");

  return (
    <div>
      <PageHeader title="My rent" description="Your monthly rent records and the payments the hostel has received." />

      <div className="mb-5 grid grid-cols-1 gap-3 @xl:grid-cols-3">
        <StatCard
          label="Outstanding balance"
          value={formatMoney(outstanding)}
          hint={overdue.length ? `${overdue.length} overdue month${overdue.length === 1 ? "" : "s"}` : outstanding > 0 ? "Not yet overdue" : "All settled"}
          tone={overdue.length ? "bad" : outstanding > 0 ? "warn" : "good"}
          icon={<Wallet className="h-3.5 w-3.5" />}
        />
        <StatCard label="Total paid" value={formatMoney(totalPaid)} hint={`${payments.length} payment${payments.length === 1 ? "" : "s"}`} tone="good" icon={<CreditCard className="h-3.5 w-3.5" />} />
        <StatCard label="Rent records" value={rows.length} hint="Months billed" tone="accent" icon={<Receipt className="h-3.5 w-3.5" />} />
      </div>

      <div className="mb-5">
        <Callout tone="info" title="How to pay">
          Pay via M-Pesa or bank transfer, then give the transaction reference to the hostel office. Your payment will appear here
          once it has been recorded.
        </Callout>
      </div>

      <div className="grid gap-5">
        <Card title="Rent records" subtitle="One record per month">
          {rows.length === 0 ? (
            <EmptyState icon={<Receipt className="h-5 w-5" />} title="No rent records yet" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Month</TH>
                  <TH align="right">Due</TH>
                  <TH align="right">Paid</TH>
                  <TH align="right">Outstanding</TH>
                  <TH>Due date</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <TD className="font-medium">{formatMonth(r.month)}</TD>
                    <TD align="right">{formatMoney(r.due)}</TD>
                    <TD align="right">{formatMoney(r.paid)}</TD>
                    <TD align="right" className={r.outstanding > 0 ? "text-ink" : "text-ink-3"}>
                      {formatMoney(r.outstanding)}
                    </TD>
                    <TD>{formatDate(r.dueDate)}</TD>
                    <TD>
                      <StatusBadge kind="rent" value={r.status} />
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Payment history" subtitle="Voided payments are not shown">
          {payments.length === 0 ? (
            <EmptyState icon={<CreditCard className="h-5 w-5" />} title="No payments recorded yet" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH align="right">Amount</TH>
                  <TH>Method</TH>
                  <TH>Reference</TH>
                </tr>
              </THead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <TD>
                      <div>{formatDate(p.paidAt)}</div>
                      <div className="text-xs text-ink-3">for {formatMonth(p.invoice.periodMonth)}</div>
                    </TD>
                    <TD align="right">{formatMoney(p.amount)}</TD>
                    <TD>{label(p.method)}</TD>
                    <TD className="font-mono text-xs text-ink-2">{p.reference ?? "—"}</TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
