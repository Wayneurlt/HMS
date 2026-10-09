"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { defineAction } from "@/lib/action";
import { ActionError } from "@/lib/auth/guards";
import { today } from "@/lib/dates";
import { formatMoney, round2 } from "@/lib/format";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import { recordPurchase, voidPurchase } from "@/lib/services/inventory";
import { zCheckbox, zDate, zId, zMoney, zOptText, zQuantity, zText } from "@/lib/validation/common";
import { revalidateKitchen } from "../server-utils";

const purchaseSchema = z.object({
  itemId: zId(),
  quantity: zQuantity(),
  unitCost: zMoney({ label: "Unit cost" }),
  supplier: zOptText(120),
  purchaseDate: zDate("Purchase date"),
  reference: zOptText(100),
  notes: zOptText(1000),
  shoppingRequestId: z.preprocess((v) => (v === "" ? undefined : v), zId().optional()).transform((v) => v ?? null),
  markRequestPurchased: zCheckbox(),
});

export const recordPurchaseAction = defineAction({ permission: "purchases.record", schema: purchaseSchema }, async (input, user) => {
  if (input.purchaseDate.getTime() > today().getTime()) {
    throw new ActionError("The purchase date cannot be in the future.", { purchaseDate: ["Cannot be in the future"] });
  }
  const item = await db.inventoryItem.findUnique({ where: { id: input.itemId } });
  if (!item || item.deletedAt || !item.isActive) {
    throw new ActionError("Choose an active stock item.", { itemId: ["Select an item"] });
  }

  const total = await db.$transaction(async (tx) => {
    if (input.shoppingRequestId) {
      const req = await tx.shoppingRequest.findUnique({ where: { id: input.shoppingRequestId } });
      if (!req) throw new ActionError("Shopping request not found.", { shoppingRequestId: ["Not found"] });
      if (req.status !== "APPROVED") {
        throw new ActionError("Purchases can only be linked to an approved shopping request.", {
          shoppingRequestId: ["Request is not approved"],
        });
      }
    }
    await recordPurchase(
      {
        itemId: input.itemId,
        quantity: input.quantity,
        unitCost: input.unitCost,
        supplier: input.supplier,
        purchaseDate: input.purchaseDate,
        reference: input.reference,
        notes: input.notes,
        shoppingRequestId: input.shoppingRequestId,
      },
      user.id,
      tx,
    );
    if (input.shoppingRequestId && input.markRequestPurchased) {
      const res = await tx.shoppingRequest.updateMany({
        where: { id: input.shoppingRequestId, status: "APPROVED" },
        data: { status: "PURCHASED" },
      });
      if (res.count === 0) throw new ActionError("The shopping request changed. Please reload and try again.");
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.SHOPPING_REQUEST_PURCHASED,
        entityType: "ShoppingRequest",
        entityId: input.shoppingRequestId,
        details: { via: "purchase", item: item.name },
      });
    }
    return round2(input.quantity * input.unitCost);
  });

  revalidateKitchen();
  return { message: `Purchase recorded: ${item.name}, ${formatMoney(total)}` };
});

export const voidPurchaseAction = defineAction(
  { permission: "purchases.void", schema: z.object({ id: zId(), reason: zText(500, "Reason") }) },
  async (input, user) => {
    await voidPurchase(input.id, input.reason, user.id);
    revalidateKitchen();
    return { message: "Purchase voided and stock reversed" };
  },
);
