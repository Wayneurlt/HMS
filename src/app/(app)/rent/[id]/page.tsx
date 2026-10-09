import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BellRing, Ban, Pencil, Plus, Receipt } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatDateTime, formatMonth, today, toISODate } from "@/lib/dates";
import { formatMoney, label, round2, toNumber } from "@/lib/format";
import { outstandingOf, syncRentStatuses } from "@/lib/services/rent";
import { ConfirmAction, Dialog } from "@/components/ui/dialog";
import {
  Avatar,
  Callout,
  Card,
  DetailList,
  EmptyState,
  LinkButton,
  PageHeader,
  ProgressBar,
  Table,
  TD,
  TH,
  THead,
} from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { voidInvoiceAction, voidPaymentAction } from "../actions";
import { EditPaymentForm, RecordPaymentForm } from "../payment-form";
import { EditInvoiceForm } from "./edit-invoice-form";
import { channelLabel } from "../reminders/shared";

export const metadata = { title: "Rent record" };

export default async function RentInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("rent.view");
  const { id } = await params;
  if (!id || id.length > 64) notFound();
  await syncRentStatuses();

  const inv = await db.rentInvoice.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, fullName: true, phone: true, status: true } },
      accommodation: { select: { bed: { select: { label: true, room: { select: { name: true } } } } } },
      payments: {
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        include: { recordedBy: { select: { name: true } }, voidedBy: { select: { name: true } } },
      },
      reminders: { orderBy: { createdAt: "desc" }, include: { rule: { select: { name: true } } } },
    },
  }).catch(() => null);
  if (!inv) notFound();

  const canManage = can(user.role, "rent.manage");
  const canAdjust = can(user.role, "rent.adjust");
  const voided = !!inv.voidedAt;
  const amountDue = toNumber(inv.amountDue);
  const amountPaid = toNumber(inv.amountPaid);
  const outstanding = outstandingOf(inv);
  const todayISO = toISODate(today());
  const monthLong = formatMonth(inv.periodMonth, "long");
  const paidPct = amountDue > 0 ? Math.min(100, (amountPaid / amountDue) * 100) : 0;
  const bed = inv.accommodation?.bed;

  return (
    <div>
      <Link href="/rent" className="mb-3 inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Rent
      </Link>
      <PageHeader
        title={`${monthLong} rent`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link href={`/students/${inv.student.id}`} className="text-ink hover:text-accent">
              {inv.student.fullName}
            </Link>
            {voided ? <span className="text-xs text-ink-3">Voided</span> : <StatusBadge kind="rent" value={inv.status} />}
          </span>
        }
        actions={
          !voided && (
            <>
              {canAdjust && (
                <Dialog
                  trigger={
                    <>
                      <Pencil className="h-4 w-4" /> Edit
                    </>
                  }
                  title="Edit rent record"
                  description={`${inv.student.fullName} · ${monthLong}`}
                >
                  <EditInvoiceForm
                    invoice={{
                      id: inv.id,
                      amountDue,
                      amountPaid,
                      dueDate: toISODate(inv.dueDate),
                      notes: inv.notes,
                    }}
                  />
                </Dialog>
              )}
              {canAdjust && (
                <ConfirmAction
                  action={voidInvoiceAction}
                  payload={{ id: inv.id }}
                  label={
                    <>
                      <Ban className="h-4 w-4" /> Void
                    </>
                  }
                  size="md"
                  variant="danger"
                  title="Void this rent record?"
                  message={
                    amountPaid > 0
                      ? "This record has payments. Void the payments first, then void the record."
                      : "Use this only for a record raised in error. It stays in the history but no longer counts as owed."
                  }
                  requireReason="Reason for voiding"
                  confirmLabel="Void record"
                  confirmVariant="danger"
                />
              )}
              {canManage && outstanding > 0 && (
                <Dialog
                  trigger={
                    <>
                      <Plus className="h-4 w-4" /> Record payment
                    </>
                  }
                  triggerVariant="primary"
                  title="Record payment"
                  description={`${inv.student.fullName} · ${monthLong}`}
                >
                  <RecordPaymentForm
                    invoices={[
                      {
                        id: inv.id,
                        studentId: inv.student.id,
                        studentName: inv.student.fullName,
                        monthLabel: monthLong,
                        dueDate: toISODate(inv.dueDate),
                        amountDue,
                        amountPaid,
                        outstanding,
                      },
                    ]}
                    preselectedId={inv.id}
                    today={todayISO}
                  />
                </Dialog>
              )}
            </>
          )
        }
      />

      {voided && (
        <div className="mb-5">
          <Callout tone="neutral" title={`Voided on ${formatDateTime(inv.voidedAt)}`}>
            {inv.voidReason ?? "No reason recorded."} This record no longer counts towards balances.
          </Callout>
        </div>
      )}

      <div className="grid gap-5 @6xl:grid-cols-3">
        <Card title="Summary" className="@6xl:col-span-1">
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={inv.student.fullName} size={40} />
            <div className="min-w-0">
              <Link href={`/students/${inv.student.id}`} className="block truncate text-sm font-medium text-ink hover:text-accent">
                {inv.student.fullName}
              </Link>
              <div className="text-xs text-ink-3">
                {inv.student.phone}
                {bed ? ` · ${bed.room.name} / ${bed.label}` : ""}
              </div>
            </div>
          </div>
          <div className="mb-4 space-y-2">
            <div className="flex items-end justify-between">
              <span className="text-xs text-ink-2">Outstanding</span>
              <span className={`tabular text-2xl font-semibold ${outstanding > 0 && !voided ? "text-ink" : "text-ink-3"}`}>
                {formatMoney(outstanding)}
              </span>
            </div>
            <ProgressBar value={paidPct} tone={outstanding <= 0 ? "good" : inv.status === "OVERDUE" ? "bad" : "accent"} />
          </div>
          <DetailList
            items={[
              { label: "Rent month", value: monthLong },
              { label: "Due date", value: formatDate(inv.dueDate) },
              { label: "Amount due", value: <span className="tabular">{formatMoney(amountDue)}</span> },
              { label: "Paid", value: <span className="tabular text-good">{formatMoney(amountPaid)}</span> },
              { label: "Status", value: voided ? "Voided" : <StatusBadge kind="rent" value={inv.status} /> },
              { label: "Created", value: formatDateTime(inv.createdAt) },
              { label: "Notes", value: inv.notes ?? "—" },
            ]}
          />
          <div className="mt-5">
            <LinkButton href={`/rent?student=${inv.student.id}`} variant="outline" size="sm">
              All rent for {inv.student.fullName.split(" ")[0]}
            </LinkButton>
          </div>
        </Card>

        <Card
          title="Payments"
          subtitle={`${inv.payments.filter((p) => !p.voidedAt).length} active payment(s)`}
          className="@6xl:col-span-2"
        >
          {inv.payments.length === 0 ? (
            <EmptyState icon={<Receipt className="h-5 w-5" />} title="No payments yet" description="Payments recorded against this month appear here." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH align="right">Amount</TH>
                  <TH>Method</TH>
                  <TH>Reference</TH>
                  <TH>Recorded</TH>
                  {canAdjust && (
                    <TH align="right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  )}
                </tr>
              </THead>
              <tbody>
                {inv.payments.map((p) => {
                  const pv = !!p.voidedAt;
                  const amount = toNumber(p.amount);
                  const maxAmount = round2(amountDue - (amountPaid - amount));
                  return (
                    <tr key={p.id} className={pv ? "opacity-60" : undefined}>
                      <TD className="whitespace-nowrap">
                        <span className={pv ? "line-through" : undefined}>{formatDate(p.paidAt)}</span>
                      </TD>
                      <TD align="right" className={pv ? "line-through" : "font-medium"}>
                        {formatMoney(amount)}
                      </TD>
                      <TD>{label(p.method)}</TD>
                      <TD>
                        <span className="font-mono text-xs">{p.reference ?? "—"}</span>
                        {p.notes && <div className="mt-0.5 max-w-55 text-xs text-ink-3">{p.notes}</div>}
                        {pv && (
                          <div className="mt-1 text-xs text-bad">
                            Voided by {p.voidedBy?.name ?? "—"} on {formatDateTime(p.voidedAt)}: {p.voidReason ?? "no reason"}
                          </div>
                        )}
                      </TD>
                      <TD className="text-xs text-ink-2">
                        <div>{p.recordedBy?.name ?? "System"}</div>
                        <div className="text-ink-3">{formatDateTime(p.createdAt)}</div>
                      </TD>
                      {canAdjust && (
                        <TD align="right">
                          {!pv && !voided && (
                            <div className="flex justify-end gap-1">
                              <Dialog
                                trigger={<Pencil className="h-4 w-4" />}
                                triggerVariant="ghost"
                                triggerSize="icon"
                                triggerClassName="h-8 w-8"
                                title="Edit payment"
                                description="Corrections are kept in the activity log."
                              >
                                <EditPaymentForm
                                  payment={{
                                    id: p.id,
                                    amount,
                                    paidAt: toISODate(p.paidAt),
                                    method: p.method,
                                    reference: p.reference,
                                    notes: p.notes,
                                  }}
                                  maxAmount={maxAmount}
                                  amountDue={amountDue}
                                  today={todayISO}
                                />
                              </Dialog>
                              <ConfirmAction
                                action={voidPaymentAction}
                                payload={{ id: p.id }}
                                label={<Ban className="h-4 w-4" />}
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Void this payment?"
                                message={`${formatMoney(amount)} on ${formatDate(p.paidAt)} will be added back to the balance. The payment stays in the history.`}
                                requireReason="Reason for voiding"
                                confirmLabel="Void payment"
                                confirmVariant="danger"
                              />
                            </div>
                          )}
                        </TD>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="mt-5" title="Reminders" subtitle="Reminders sent for this rent record">
        {inv.reminders.length === 0 ? (
          <EmptyState
            icon={<BellRing className="h-5 w-5" />}
            title="No reminders yet"
            description={
              <>
                Reminders follow the <Link href="/rent/reminders" className="text-accent">reminder schedule</Link>.
              </>
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Rule</TH>
                <TH>Channel</TH>
                <TH>Status</TH>
                <TH>Message</TH>
              </tr>
            </THead>
            <tbody>
              {inv.reminders.map((r) => (
                <tr key={r.id}>
                  <TD className="whitespace-nowrap text-xs text-ink-2">{formatDateTime(r.createdAt)}</TD>
                  <TD className="text-xs">
                    <div>{r.rule?.name ?? label(r.type)}</div>
                    <div className="text-ink-3">{r.type === "ON_DUE" ? "On due date" : label(r.type)}</div>
                  </TD>
                  <TD className="text-xs">{channelLabel(r.channel)}</TD>
                  <TD>
                    <StatusBadge kind="reminder" value={r.status} />
                    {r.error && <div className="mt-1 text-xs text-ink-3">{r.error}</div>}
                  </TD>
                  <TD className="max-w-90 text-xs text-ink-2">
                    <span className="line-clamp-2" title={r.message}>
                      {r.message}
                    </span>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
