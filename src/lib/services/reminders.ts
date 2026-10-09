import "server-only";
import type { ReminderRule, ReminderType } from "@prisma/client";
import { db } from "@/lib/db";
import { addDays, formatDate, formatMonth, today as todayFn, toISODate } from "@/lib/dates";
import { formatMoney, toNumber } from "@/lib/format";
import { getMessagingProvider } from "@/lib/messaging";
import { ACTIONS, logActivity } from "./activity";
import { notifyRoles, notifyUsers } from "./notifications";
import { ensureRentInvoices, outstandingOf, syncRentStatuses } from "./rent";
import { getSettings } from "./settings";

/** How many days after a rule's trigger day it may still fire (covers missed cron runs). */
const GRACE_DAYS = 3;

export const DEFAULT_REMINDER_RULES = [
  {
    name: "3 days before due date",
    offsetDays: -3,
    template: "Hi {name}, your {month} rent of {outstanding} at {hostel} is due on {dueDate}.",
  },
  {
    name: "On due date",
    offsetDays: 0,
    template: "Hi {name}, your {month} rent of {outstanding} at {hostel} is due today ({dueDate}).",
  },
  {
    name: "3 days overdue",
    offsetDays: 3,
    template:
      "Hi {name}, your {month} rent at {hostel} is overdue. Outstanding balance: {outstanding} (was due {dueDate}). Please pay as soon as possible.",
  },
] as const;

export function reminderTypeFor(offsetDays: number): ReminderType {
  if (offsetDays < 0) return "BEFORE_DUE";
  if (offsetDays === 0) return "ON_DUE";
  return "OVERDUE";
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** Make sure the default schedule exists (used by seed and owner setup). */
export async function ensureDefaultReminderRules(): Promise<void> {
  const count = await db.reminderRule.count();
  if (count > 0) return;
  await db.reminderRule.createMany({ data: DEFAULT_REMINDER_RULES.map((r) => ({ ...r, channel: "IN_APP" })) });
}

export type ReminderRunResult = {
  date: string;
  invoicesGenerated: number;
  markedOverdue: number;
  created: number;
  sent: number;
  failed: number;
  skipped: number;
};

/**
 * Daily rent job: generate this month's invoices, mark overdue invoices, and send reminders
 * according to the active ReminderRules. Idempotent: each (invoice, rule) pair is sent once.
 */
export async function runRentReminders(opts: { userId?: string | null; today?: Date } = {}): Promise<ReminderRunResult> {
  const today = opts.today ?? todayFn();
  const invoicesGenerated = await ensureRentInvoices(db, { userId: opts.userId ?? null, upTo: today });
  const markedOverdue = await syncRentStatuses(db, today);

  const [settings, rules] = await Promise.all([
    getSettings(),
    db.reminderRule.findMany({ where: { isActive: true }, orderBy: { offsetDays: "asc" } }),
  ]);
  const provider = getMessagingProvider();
  const result: ReminderRunResult = {
    date: toISODate(today),
    invoicesGenerated,
    markedOverdue,
    created: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const rule of rules) {
    await runRule(rule);
  }

  async function runRule(rule: ReminderRule) {
    // Fires when today ∈ [dueDate + offset, dueDate + offset + GRACE]; before-due rules stop at the due date.
    const latestDue = addDays(today, -rule.offsetDays);
    const earliestDue = addDays(latestDue, -GRACE_DAYS);
    const invoices = await db.rentInvoice.findMany({
      where: {
        voidedAt: null,
        status: { not: "PAID" },
        dueDate: { gte: earliestDue, lte: latestDue, ...(rule.offsetDays < 0 ? { gt: today } : {}) },
        reminders: { none: { ruleId: rule.id } },
        student: { deletedAt: null, status: { in: ["ACTIVE", "SUSPENDED", "CHECKED_OUT"] } },
      },
      include: { student: { select: { id: true, fullName: true, phone: true, email: true, userId: true } } },
    });

    for (const inv of invoices) {
      const outstanding = outstandingOf(inv);
      if (outstanding <= 0) continue;
      const message = renderTemplate(rule.template, {
        name: inv.student.fullName.split(" ")[0] ?? inv.student.fullName,
        fullName: inv.student.fullName,
        month: formatMonth(inv.periodMonth, "long"),
        amount: formatMoney(inv.amountDue),
        outstanding: formatMoney(outstanding),
        dueDate: formatDate(inv.dueDate),
        hostel: settings.hostelName,
      });
      const type = reminderTypeFor(rule.offsetDays);

      let status: "SENT" | "FAILED" | "SKIPPED" = "SKIPPED";
      let recipient = inv.student.fullName;
      let error: string | null = null;
      let providerName: string | null = null;

      if (rule.channel === "IN_APP") {
        if (inv.student.userId) {
          await notifyUsers(db, [inv.student.userId], {
            type: type === "OVERDUE" ? "RENT_OVERDUE" : type === "ON_DUE" ? "RENT_DUE_TODAY" : "RENT_DUE_SOON",
            title: type === "OVERDUE" ? "Rent overdue" : type === "ON_DUE" ? "Rent due today" : "Rent due soon",
            message,
            link: "/me/rent",
            dedupeKey: `reminder:${inv.id}:${rule.id}`,
          });
          status = "SENT";
          recipient = `user:${inv.student.userId}`;
          providerName = "in-app";
        } else {
          error = "Student has no login account";
        }
      } else {
        const to = rule.channel === "EMAIL" ? inv.student.email : inv.student.phone;
        recipient = to ?? inv.student.fullName;
        if (!to) {
          error = `No ${rule.channel === "EMAIL" ? "email" : "phone"} on file`;
        } else if (!provider || !provider.supports(rule.channel)) {
          error = "No messaging provider configured";
        } else {
          providerName = provider.name;
          try {
            const r = await provider.send({ channel: rule.channel, to, body: message, subject: "Rent reminder" });
            status = r.ok ? "SENT" : "FAILED";
            error = r.error ?? null;
          } catch (e) {
            status = "FAILED";
            error = e instanceof Error ? e.message.slice(0, 500) : "Send failed";
          }
        }
      }

      const created = await db.reminderLog.createMany({
        data: [
          {
            invoiceId: inv.id,
            studentId: inv.studentId,
            ruleId: rule.id,
            type,
            channel: rule.channel,
            recipient,
            message,
            status,
            provider: providerName,
            error,
            scheduledFor: addDays(inv.dueDate, rule.offsetDays),
            sentAt: status === "SENT" ? new Date() : null,
          },
        ],
        skipDuplicates: true,
      });
      if (created.count === 0) continue;
      result.created += 1;
      if (status === "SENT") result.sent += 1;
      else if (status === "FAILED") result.failed += 1;
      else result.skipped += 1;
    }
  }

  // One daily summary for staff when there is overdue rent.
  const overdue = await db.rentInvoice.aggregate({
    where: { voidedAt: null, status: "OVERDUE" },
    _count: { _all: true },
    _sum: { amountDue: true, amountPaid: true },
  });
  if (overdue._count._all > 0) {
    const amount = toNumber(overdue._sum.amountDue) - toNumber(overdue._sum.amountPaid);
    await notifyRoles(db, ["OWNER", "HOSTEL_MANAGER"], {
      type: "RENT_OVERDUE",
      title: "Overdue rent",
      message: `${overdue._count._all} rent record${overdue._count._all === 1 ? " is" : "s are"} overdue, totalling ${formatMoney(amount)}.`,
      link: "/rent?status=OVERDUE",
      dedupeKey: `overdue-summary:${toISODate(today)}`,
    });
  }

  await logActivity(db, {
    userId: opts.userId ?? null,
    action: ACTIONS.REMINDERS_RUN,
    entityType: "ReminderRun",
    entityId: toISODate(today),
    details: result,
  });
  return result;
}

/**
 * Run the daily job at most once per hostel day. Called opportunistically from the admin
 * dashboard so reminders work even without a cron; the cron endpoint calls runRentReminders directly.
 */
export async function runDailyJobsIfDue(): Promise<void> {
  const today = todayFn();
  const already = await db.activityLog.findFirst({
    where: { action: ACTIONS.REMINDERS_RUN, entityId: toISODate(today) },
    select: { id: true },
  });
  if (already) return;
  try {
    await runRentReminders({ today });
  } catch (e) {
    console.error("[reminders] daily run failed", e);
  }
}
