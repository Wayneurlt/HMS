"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { defineAction } from "@/lib/action";
import { ActionError } from "@/lib/auth/guards";
import { today } from "@/lib/dates";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import {
  editInvoice,
  editPayment,
  ensureRentInvoices,
  recordPayment,
  voidInvoice,
  voidPayment,
} from "@/lib/services/rent";
import { runRentReminders } from "@/lib/services/reminders";
import { zCheckbox, zDate, zId, zInt, zMoney, zOptText, zText } from "@/lib/validation/common";

const METHODS = ["MPESA", "CASH", "BANK", "OTHER"] as const;
const CHANNELS = ["IN_APP", "SMS", "WHATSAPP", "EMAIL"] as const;

function revalidateRent() {
  revalidatePath("/rent");
  revalidatePath("/rent/[id]", "page");
  revalidatePath("/rent/reminders");
  revalidatePath("/students/[studentId]", "page");
  revalidatePath("/dashboard");
  revalidatePath("/me/rent");
}

// ───────── Payments ─────────

const paymentFields = {
  amount: zMoney({ label: "Amount" }),
  paidAt: zDate("Payment date"),
  method: z.enum(METHODS, { error: "Choose a payment method" }),
  reference: zOptText(100).transform((v) => (v ? v.replace(/\s+/g, "").toUpperCase() : null)),
  notes: zOptText(500),
};

type PaymentShape = { paidAt: Date; method: (typeof METHODS)[number]; reference: string | null };

function checkPayment(v: PaymentShape, ctx: z.RefinementCtx) {
  if (v.paidAt.getTime() > today().getTime()) {
    ctx.addIssue({ code: "custom", path: ["paidAt"], message: "Payment date cannot be in the future" });
  }
  if ((v.method === "MPESA" || v.method === "BANK") && !v.reference) {
    ctx.addIssue({
      code: "custom",
      path: ["reference"],
      message: v.method === "MPESA" ? "M-Pesa transaction code is required" : "Bank reference is required",
    });
  }
}

const recordPaymentSchema = z.object({ invoiceId: zId(), ...paymentFields }).superRefine(checkPayment);

export const recordPaymentAction = defineAction(
  { permission: "rent.manage", schema: recordPaymentSchema },
  async (input, user) => {
    await recordPayment(
      {
        invoiceId: input.invoiceId,
        amount: input.amount,
        paidAt: input.paidAt,
        method: input.method,
        reference: input.reference,
        notes: input.notes,
      },
      user.id,
    );
    revalidateRent();
    return { message: "Payment recorded" };
  },
);

const editPaymentSchema = z.object({ id: zId(), ...paymentFields }).superRefine(checkPayment);

export const editPaymentAction = defineAction(
  { permission: "rent.adjust", schema: editPaymentSchema },
  async (input, user) => {
    if (input.reference) {
      const dup = await db.rentPayment.findFirst({
        where: { reference: input.reference, method: input.method, voidedAt: null, id: { not: input.id } },
        select: { id: true },
      });
      if (dup) {
        throw new ActionError("A payment with this reference has already been recorded.", {
          reference: ["Duplicate transaction reference"],
        });
      }
    }
    await editPayment(
      input.id,
      {
        amount: input.amount,
        paidAt: input.paidAt,
        method: input.method,
        reference: input.reference,
        notes: input.notes,
      },
      user.id,
    );
    revalidateRent();
    return { message: "Payment updated" };
  },
);

const voidSchema = z.object({ id: zId(), reason: zText(500, "Reason") });

export const voidPaymentAction = defineAction({ permission: "rent.adjust", schema: voidSchema }, async (input, user) => {
  await voidPayment(input.id, input.reason, user.id);
  revalidateRent();
  return { message: "Payment voided" };
});

// ───────── Invoices ─────────

export const generateInvoicesAction = defineAction(
  { permission: "rent.manage", schema: z.object({}) },
  async (_input, user) => {
    const created = await ensureRentInvoices(db, { userId: user.id });
    revalidateRent();
    return {
      message:
        created === 0
          ? "All rent records are already up to date"
          : `${created} rent record${created === 1 ? "" : "s"} created`,
      data: { created },
    };
  },
);

const editInvoiceSchema = z.object({
  id: zId(),
  amountDue: zMoney({ label: "Amount due" }),
  dueDate: zDate("Due date"),
  notes: zOptText(1000),
});

export const editInvoiceAction = defineAction(
  { permission: "rent.adjust", schema: editInvoiceSchema },
  async (input, user) => {
    await editInvoice(input.id, { amountDue: input.amountDue, dueDate: input.dueDate, notes: input.notes }, user.id);
    revalidateRent();
    return { message: "Rent record updated" };
  },
);

export const voidInvoiceAction = defineAction({ permission: "rent.adjust", schema: voidSchema }, async (input, user) => {
  await voidInvoice(input.id, input.reason, user.id);
  revalidateRent();
  return { message: "Rent record voided" };
});

// ───────── Reminders ─────────

export const runRemindersAction = defineAction(
  { permission: "rent.manage", schema: z.object({}), rateLimit: { key: "reminders-run", limit: 5, windowMs: 60_000 } },
  async (_input, user) => {
    const r = await runRentReminders({ userId: user.id });
    revalidateRent();
    const parts = [
      `${r.created} reminder${r.created === 1 ? "" : "s"} (${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed)`,
    ];
    if (r.invoicesGenerated) parts.push(`${r.invoicesGenerated} new rent records`);
    if (r.markedOverdue) parts.push(`${r.markedOverdue} marked overdue`);
    return { message: `Reminders run: ${parts.join(" · ")}`, data: r };
  },
);

const ruleSchema = z.object({
  name: zText(80, "Name"),
  offsetDays: zInt(-30, 60, "Offset"),
  channel: z.enum(CHANNELS, { error: "Choose a channel" }),
  template: zText(1000, "Message template"),
  isActive: zCheckbox(),
});

async function assertOffsetFree(offsetDays: number, exceptId?: string) {
  const clash = await db.reminderRule.findFirst({
    where: { offsetDays, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  if (clash) {
    throw new ActionError(`Another rule ("${clash.name}") already uses this offset.`, {
      offsetDays: ["Each rule needs a different offset"],
    });
  }
}

export const createReminderRule = defineAction(
  { permission: "reminders.manage", schema: ruleSchema },
  async (input, user) => {
    await assertOffsetFree(input.offsetDays);
    const rule = await db.reminderRule.create({ data: input });
    await logActivity(db, {
      userId: user.id,
      action: ACTIONS.REMINDER_RULE_UPDATED,
      entityType: "ReminderRule",
      entityId: rule.id,
      details: { op: "created", ...input },
    });
    revalidatePath("/rent/reminders");
    return { message: `Rule "${rule.name}" created` };
  },
);

export const updateReminderRule = defineAction(
  { permission: "reminders.manage", schema: ruleSchema.extend({ id: zId() }) },
  async ({ id, ...input }, user) => {
    const before = await db.reminderRule.findUnique({ where: { id } });
    if (!before) throw new ActionError("Reminder rule not found.");
    await assertOffsetFree(input.offsetDays, id);
    await db.reminderRule.update({ where: { id }, data: input });
    await logActivity(db, {
      userId: user.id,
      action: ACTIONS.REMINDER_RULE_UPDATED,
      entityType: "ReminderRule",
      entityId: id,
      details: {
        op: "updated",
        before: {
          name: before.name,
          offsetDays: before.offsetDays,
          channel: before.channel,
          template: before.template,
          isActive: before.isActive,
        },
        after: input,
      },
    });
    revalidatePath("/rent/reminders");
    return { message: "Rule updated" };
  },
);

export const toggleReminderRule = defineAction(
  { permission: "reminders.manage", schema: z.object({ id: zId(), isActive: zCheckbox() }) },
  async (input, user) => {
    const rule = await db.reminderRule.findUnique({ where: { id: input.id } });
    if (!rule) throw new ActionError("Reminder rule not found.");
    await db.reminderRule.update({ where: { id: input.id }, data: { isActive: input.isActive } });
    await logActivity(db, {
      userId: user.id,
      action: ACTIONS.REMINDER_RULE_UPDATED,
      entityType: "ReminderRule",
      entityId: input.id,
      details: { op: input.isActive ? "activated" : "deactivated", name: rule.name },
    });
    revalidatePath("/rent/reminders");
    return { message: input.isActive ? `"${rule.name}" activated` : `"${rule.name}" paused` };
  },
);

/** Rules with reminder history are deactivated (kept for the log); unused rules are removed. */
export const deleteReminderRule = defineAction(
  { permission: "reminders.manage", schema: z.object({ id: zId() }) },
  async (input, user) => {
    const rule = await db.reminderRule.findUnique({
      where: { id: input.id },
      include: { _count: { select: { logs: true } } },
    });
    if (!rule) throw new ActionError("Reminder rule not found.");
    const keep = rule._count.logs > 0;
    if (keep) {
      await db.reminderRule.update({ where: { id: rule.id }, data: { isActive: false } });
    } else {
      await db.reminderRule.delete({ where: { id: rule.id } });
    }
    await logActivity(db, {
      userId: user.id,
      action: ACTIONS.REMINDER_RULE_UPDATED,
      entityType: "ReminderRule",
      entityId: rule.id,
      details: { op: keep ? "deactivated (has history)" : "deleted", name: rule.name, offsetDays: rule.offsetDays },
    });
    revalidatePath("/rent/reminders");
    return {
      message: keep ? `"${rule.name}" has reminder history, so it was deactivated instead` : `"${rule.name}" deleted`,
    };
  },
);
