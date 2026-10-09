"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { defineAction } from "@/lib/action";
import { ActionError } from "@/lib/auth/guards";
import { today } from "@/lib/dates";
import { formatMoney, round2, toNumber } from "@/lib/format";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import { zDate, zId, zMoney, zOptText, zText } from "@/lib/validation/common";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "../constants";
import { revalidateKitchen } from "../server-utils";

const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES, { error: "Choose a category" }),
  description: zText(200, "Description"),
  amount: zMoney(),
  expenseDate: zDate("Date"),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: "Choose a payment method" }),
  reference: zOptText(100),
  notes: zOptText(1000),
});

export const recordExpense = defineAction({ permission: "expenses.record", schema: expenseSchema }, async (input, user) => {
  if (input.expenseDate.getTime() > today().getTime()) {
    throw new ActionError("The expense date cannot be in the future.", { expenseDate: ["Cannot be in the future"] });
  }
  const amount = round2(input.amount);
  await db.$transaction(async (tx) => {
    const e = await tx.kitchenExpense.create({
      data: {
        category: input.category,
        description: input.description,
        amount,
        expenseDate: input.expenseDate,
        paymentMethod: input.paymentMethod,
        reference: input.reference,
        notes: input.notes,
        recordedById: user.id,
      },
    });
    await logActivity(tx, {
      userId: user.id,
      action: ACTIONS.EXPENSE_RECORDED,
      entityType: "KitchenExpense",
      entityId: e.id,
      details: { category: input.category, description: input.description, amount, paymentMethod: input.paymentMethod, reference: input.reference },
    });
  });
  revalidateKitchen();
  return { message: `Expense recorded: ${formatMoney(amount)}` };
});

export const voidExpense = defineAction(
  { permission: "expenses.void", schema: z.object({ id: zId(), reason: zText(500, "Reason") }) },
  async (input, user) => {
    await db.$transaction(async (tx) => {
      const e = await tx.kitchenExpense.findUnique({ where: { id: input.id } });
      if (!e) throw new ActionError("Expense not found.");
      const res = await tx.kitchenExpense.updateMany({
        where: { id: input.id, voidedAt: null },
        data: { voidedAt: new Date(), voidedById: user.id, voidReason: input.reason },
      });
      if (res.count === 0) throw new ActionError("This expense is already voided.");
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.EXPENSE_VOIDED,
        entityType: "KitchenExpense",
        entityId: e.id,
        details: { description: e.description, amount: toNumber(e.amount), reason: input.reason },
      });
    });
    revalidateKitchen();
    return { message: "Expense voided" };
  },
);
