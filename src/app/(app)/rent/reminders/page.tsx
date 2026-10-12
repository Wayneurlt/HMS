import { APP_NAME } from "@/lib/brand";
import Link from "next/link";
import { ArrowLeft, BellRing, Pause, Pencil, Play, PlayCircle, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { addDays, formatDate, formatDateTime, formatMonth, today } from "@/lib/dates";
import { formatMoney, label } from "@/lib/format";
import { getMessagingProvider } from "@/lib/messaging";
import { ACTIONS } from "@/lib/services/activity";
import type { ReminderRunResult } from "@/lib/services/reminders";
import { ConfirmAction, Dialog } from "@/components/ui/dialog";
import { Badge, Callout, Card, EmptyState, PageHeader, Table, TD, TH, THead } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { deleteReminderRule, runRemindersAction, toggleReminderRule } from "../actions";
import { ActionButton } from "../controls";
import { RuleForm } from "./rule-form";
import { channelLabel, offsetLabel } from "./shared";

export const metadata = { title: "Rent reminders" };

export default async function RemindersPage() {
  const user = await requirePermission("reminders.view");
  const canEdit = can(user.role, "reminders.manage");
  const canRun = can(user.role, "rent.manage");

  const [rules, logs, lastRun] = await Promise.all([
    db.reminderRule.findMany({ orderBy: { offsetDays: "asc" }, include: { _count: { select: { logs: true } } } }),
    db.reminderLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { student: { select: { id: true, fullName: true } } },
    }),
    db.activityLog.findFirst({ where: { action: ACTIONS.REMINDERS_RUN }, orderBy: { createdAt: "desc" } }),
  ]);
  const provider = getMessagingProvider();
  const providerConfigured = !!provider;
  const lastResult = (lastRun?.details ?? null) as Partial<ReminderRunResult> | null;

  const t = today();
  const sampleVars = {
    name: "Jane",
    fullName: "Jane Wanjiku",
    month: formatMonth(t, "long"),
    amount: formatMoney(10000),
    outstanding: formatMoney(4000),
    dueDate: formatDate(addDays(t, 3)),
    hostel: APP_NAME,
  };

  return (
    <div>
      <Link href="/rent" className="mb-1 inline-flex items-center gap-1.5 py-2 text-xs text-ink-2 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Rent
      </Link>
      <PageHeader
        title="Rent reminders"
        description="Automatic reminders before, on and after each rent due date."
        actions={
          <>
            {canRun && (
              <ConfirmAction
                action={runRemindersAction}
                payload={{}}
                label={
                  <>
                    <PlayCircle className="h-4 w-4" /> Run reminders now
                  </>
                }
                size="md"
                title="Run reminders now?"
                message="Generates missing rent records, marks overdue rent and sends any reminders that are due today. Each reminder is only ever sent once per rent record."
                confirmLabel="Run now"
              />
            )}
            {canEdit && (
              <Dialog
                trigger={
                  <>
                    <Plus className="h-4 w-4" /> New rule
                  </>
                }
                triggerVariant="primary"
                title="New reminder rule"
                wide
              >
                <RuleForm sampleVars={sampleVars} providerConfigured={providerConfigured} />
              </Dialog>
            )}
          </>
        }
      />

      <div className="grid gap-5 @4xl:grid-cols-3">
        <Card title="How it works" className="@4xl:col-span-2">
          <div className="space-y-2 text-sm text-ink-2">
            <p>
              The reminder job runs once a day (from the scheduled cron at <code className="text-ink">/api/cron/reminders</code>, or
              automatically when staff open the dashboard). For every unpaid rent record it checks each active rule below and sends
              the reminder when the day matches <em>due date + offset</em>. If a run is missed, a rule still fires for up to 3 days
              afterwards; before-due rules stop once the due date arrives.
            </p>
            <p>Each rule is sent at most once per rent record, so running the job again is always safe.</p>
          </div>
          {!providerConfigured && (
            <div className="mt-4">
              <Callout tone="warn" title="SMS, WhatsApp and email are not connected">
                Set <code>MESSAGING_PROVIDER</code> to enable external delivery. Until then, reminders on those channels are logged as
                Skipped; in-app reminders always work.
              </Callout>
            </div>
          )}
        </Card>
        <Card title="Last run">
          {lastRun ? (
            <div className="space-y-3">
              <div className="text-sm text-ink">{formatDateTime(lastRun.createdAt)}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <RunStat label="Reminders" value={lastResult?.created} />
                <RunStat label="Sent" value={lastResult?.sent} />
                <RunStat label="Skipped" value={lastResult?.skipped} />
                <RunStat label="Failed" value={lastResult?.failed} />
                <RunStat label="New rent records" value={lastResult?.invoicesGenerated} />
                <RunStat label="Marked overdue" value={lastResult?.markedOverdue} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-3">The reminder job has not run yet.</p>
          )}
        </Card>
      </div>

      <Card className="mt-5" title="Schedule" subtitle={`${rules.filter((r) => r.isActive).length} active rule(s)`}>
        {rules.length === 0 ? (
          <EmptyState icon={<BellRing className="h-5 w-5" />} title="No reminder rules" description="Add a rule to start sending rent reminders." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Rule</TH>
                <TH>When</TH>
                <TH>Channel</TH>
                <TH>Status</TH>
                <TH>Template</TH>
                {canEdit && (
                  <TH align="right">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </tr>
            </THead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className={r.isActive ? undefined : "opacity-60"}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD className="whitespace-nowrap text-ink-2">{offsetLabel(r.offsetDays)}</TD>
                  <TD>
                    <span className="text-sm">{channelLabel(r.channel)}</span>
                    {r.channel !== "IN_APP" && !providerConfigured && (
                      <div>
                        <Badge tone="warn" className="mt-1">
                          Not connected
                        </Badge>
                      </div>
                    )}
                  </TD>
                  <TD>
                    <StatusBadge kind="active" value={r.isActive} />
                  </TD>
                  <TD className="max-w-95 text-xs text-ink-2">
                    <span className="line-clamp-2" title={r.template}>
                      {r.template}
                    </span>
                  </TD>
                  {canEdit && (
                    <TD align="right">
                      <div className="flex justify-end gap-1">
                        <ActionButton
                          action={toggleReminderRule}
                          payload={{ id: r.id, isActive: !r.isActive }}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={r.isActive ? "Pause rule" : "Activate rule"}
                        >
                          {r.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </ActionButton>
                        <Dialog
                          trigger={<Pencil className="h-4 w-4" />}
                          triggerVariant="ghost"
                          triggerSize="icon"
                          triggerClassName="h-8 w-8"
                          title="Edit reminder rule"
                          wide
                        >
                          <RuleForm
                            initial={{
                              id: r.id,
                              name: r.name,
                              offsetDays: r.offsetDays,
                              channel: r.channel,
                              template: r.template,
                              isActive: r.isActive,
                            }}
                            sampleVars={sampleVars}
                            providerConfigured={providerConfigured}
                          />
                        </Dialog>
                        <ConfirmAction
                          action={deleteReminderRule}
                          payload={{ id: r.id }}
                          label={<Trash2 className="h-4 w-4" />}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Delete this rule?"
                          message={
                            r._count.logs > 0
                              ? `"${r.name}" has sent ${r._count.logs} reminder(s), so it will be deactivated instead of deleted to keep the history.`
                              : `"${r.name}" has never sent a reminder and will be removed.`
                          }
                          confirmLabel={r._count.logs > 0 ? "Deactivate" : "Delete"}
                          confirmVariant="danger"
                        />
                      </div>
                    </TD>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-5" title="Reminder log" subtitle="Latest 100 reminders">
        {logs.length === 0 ? (
          <EmptyState icon={<BellRing className="h-5 w-5" />} title="No reminders sent yet" description="Reminders appear here once the daily job sends them." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Student</TH>
                <TH>Type</TH>
                <TH>Channel</TH>
                <TH>Recipient</TH>
                <TH>Status</TH>
                <TH>Message</TH>
              </tr>
            </THead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <TD className="whitespace-nowrap text-xs text-ink-2">
                    <Link href={`/rent/${l.invoiceId}`} className="hover:text-accent-hi">
                      {formatDateTime(l.createdAt)}
                    </Link>
                  </TD>
                  <TD>
                    <Link href={`/students/${l.student.id}`} className="hover:text-accent-hi">
                      {l.student.fullName}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">{l.type === "ON_DUE" ? "On due date" : label(l.type)}</TD>
                  <TD className="text-xs">{channelLabel(l.channel)}</TD>
                  <TD className="max-w-40 text-xs text-ink-2">
                    <span className="block truncate" title={l.recipient}>
                      {l.recipient.startsWith("user:") ? "Student account" : l.recipient}
                    </span>
                  </TD>
                  <TD>
                    <StatusBadge kind="reminder" value={l.status} />
                    {l.error && <div className="mt-1 max-w-45 text-xs text-ink-3">{l.error}</div>}
                  </TD>
                  <TD className="max-w-80 text-xs text-ink-2">
                    <span className="block truncate" title={l.message}>
                      {l.message}
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

function RunStat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg bg-card-2 px-3 py-2">
      <div className="text-ink-3">{label}</div>
      <div className="tabular text-base font-semibold text-ink">{value ?? 0}</div>
    </div>
  );
}
