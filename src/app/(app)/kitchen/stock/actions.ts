"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { defineAction } from "@/lib/action";
import { ActionError } from "@/lib/auth/guards";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import { moveStock } from "@/lib/services/inventory";
import { formatNumber, toNumber } from "@/lib/format";
import { zCheckbox, zId, zOptText, zQuantity, zText } from "@/lib/validation/common";
import { INVENTORY_CATEGORIES } from "../constants";
import { revalidateKitchen } from "../server-utils";

const zOptQuantity = () =>
  z
    .preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), zQuantity({ allowZero: true }).optional())
    .transform((v) => (v === undefined ? null : v));

const baseItem = z.object({
  name: zText(80, "Name"),
  category: z.enum(INVENTORY_CATEGORIES, { error: "Choose a category" }),
  unit: zText(20, "Unit"),
  minQuantity: zQuantity({ allowZero: true }),
  maxQuantity: zOptQuantity(),
  supplier: zOptText(120),
  notes: zOptText(1000),
});

const maxCheck = <T extends { minQuantity: number; maxQuantity: number | null }>(v: T, ctx: z.RefinementCtx) => {
  if (v.maxQuantity !== null && v.maxQuantity < v.minQuantity) {
    ctx.addIssue({ code: "custom", path: ["maxQuantity"], message: "Maximum must be at least the minimum" });
  }
};

async function assertNameFree(name: string, exceptId?: string) {
  const clash = await db.inventoryItem.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, deletedAt: true },
  });
  if (clash) {
    throw new ActionError(
      clash.deletedAt ? "A removed item already uses this name. Choose a different name." : "An item with this name already exists.",
      { name: ["Name already in use"] },
    );
  }
}

export const createStockItem = defineAction(
  {
    permission: "stock.manage",
    schema: baseItem.extend({ openingQuantity: zOptQuantity() }).superRefine(maxCheck),
  },
  async (input, user) => {
    await assertNameFree(input.name);
    const item = await db.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          name: input.name,
          category: input.category,
          unit: input.unit,
          minQuantity: input.minQuantity,
          maxQuantity: input.maxQuantity,
          supplier: input.supplier,
          notes: input.notes,
        },
      });
      if (input.openingQuantity && input.openingQuantity > 0) {
        await moveStock(tx, { itemId: item.id, change: input.openingQuantity, type: "OPENING", reason: "Opening stock", userId: user.id });
      }
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.STOCK_ITEM_CREATED,
        entityType: "InventoryItem",
        entityId: item.id,
        details: { name: item.name, unit: item.unit, openingQuantity: input.openingQuantity ?? 0 },
      });
      return item;
    });
    revalidateKitchen();
    return { message: `${item.name} added to stock` };
  },
);

export const updateStockItem = defineAction(
  { permission: "stock.manage", schema: baseItem.extend({ id: zId() }).superRefine(maxCheck) },
  async (input, user) => {
    const existing = await db.inventoryItem.findUnique({ where: { id: input.id } });
    if (!existing || existing.deletedAt) throw new ActionError("Stock item not found.");
    await assertNameFree(input.name, input.id);
    await db.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id: input.id },
        data: {
          name: input.name,
          category: input.category,
          unit: input.unit,
          minQuantity: input.minQuantity,
          maxQuantity: input.maxQuantity,
          supplier: input.supplier,
          notes: input.notes,
        },
      });
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.STOCK_ITEM_UPDATED,
        entityType: "InventoryItem",
        entityId: input.id,
        details: {
          name: input.name,
          ...(existing.name !== input.name ? { previousName: existing.name } : {}),
          minQuantity: input.minQuantity,
          maxQuantity: input.maxQuantity,
        },
      });
    });
    revalidateKitchen();
    return { message: "Item updated" };
  },
);

export const setStockItemActive = defineAction(
  { permission: "stock.manage", schema: z.object({ id: zId(), active: zCheckbox() }) },
  async (input, user) => {
    const existing = await db.inventoryItem.findUnique({ where: { id: input.id } });
    if (!existing || existing.deletedAt) throw new ActionError("Stock item not found.");
    await db.$transaction(async (tx) => {
      await tx.inventoryItem.update({ where: { id: input.id }, data: { isActive: input.active } });
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.STOCK_ITEM_UPDATED,
        entityType: "InventoryItem",
        entityId: input.id,
        details: { name: existing.name, isActive: input.active },
      });
    });
    revalidateKitchen();
    return { message: input.active ? `${existing.name} reactivated` : `${existing.name} deactivated` };
  },
);

/** Soft delete: the item disappears from lists but its ledger and purchases stay. */
export const removeStockItem = defineAction(
  { permission: "stock.manage", schema: z.object({ id: zId() }) },
  async (input, user) => {
    const existing = await db.inventoryItem.findUnique({ where: { id: input.id } });
    if (!existing || existing.deletedAt) throw new ActionError("Stock item not found.");
    await db.$transaction(async (tx) => {
      await tx.inventoryItem.update({ where: { id: input.id }, data: { deletedAt: new Date(), isActive: false } });
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.STOCK_ITEM_UPDATED,
        entityType: "InventoryItem",
        entityId: input.id,
        details: { name: existing.name, removed: true, quantityAtRemoval: toNumber(existing.currentQuantity) },
      });
    });
    revalidateKitchen();
    return { message: `${existing.name} removed` };
  },
);

const adjustSchema = z
  .object({
    id: zId(),
    mode: z.enum(["CONSUMPTION", "WASTE", "COUNT"], { error: "Choose an adjustment type" }),
    quantity: zQuantity({ allowZero: true }),
    reason: zOptText(300),
  })
  .superRefine((v, ctx) => {
    if (v.mode !== "COUNT" && v.quantity <= 0) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "Must be greater than 0" });
    }
    if (v.mode !== "CONSUMPTION" && !v.reason) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Give a reason for this adjustment" });
    }
  });

export const adjustStock = defineAction({ permission: "stock.manage", schema: adjustSchema }, async (input, user) => {
  const result = await db.$transaction(async (tx) => {
    // Lock first so the counted-quantity difference is computed against a stable balance.
    await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id = ${input.id} FOR UPDATE`;
    const item = await tx.inventoryItem.findUnique({ where: { id: input.id } });
    if (!item || item.deletedAt) throw new ActionError("Stock item not found.");
    const current = toNumber(item.currentQuantity);
    let change: number;
    let type: "CONSUMPTION" | "WASTE" | "ADJUSTMENT";
    if (input.mode === "COUNT") {
      change = Math.round((input.quantity - current) * 1000) / 1000;
      type = "ADJUSTMENT";
      if (change === 0) {
        throw new ActionError("The counted quantity already matches the stock balance.", { quantity: ["No change"] });
      }
    } else {
      change = -input.quantity;
      type = input.mode;
    }
    const reason =
      input.reason ??
      (type === "CONSUMPTION" ? "Used in kitchen" : `Stock count (${formatNumber(current, 3)} → ${formatNumber(input.quantity, 3)})`);
    const res = await moveStock(tx, { itemId: item.id, change, type, reason, userId: user.id });
    await logActivity(tx, {
      userId: user.id,
      action: ACTIONS.STOCK_ADJUSTED,
      entityType: "InventoryItem",
      entityId: item.id,
      details: { name: item.name, type, change, balanceAfter: res.balanceAfter, unit: item.unit, reason },
    });
    return { name: item.name, unit: item.unit, balance: res.balanceAfter };
  });
  revalidateKitchen();
  return { message: `${result.name}: ${formatNumber(result.balance, 3)} ${result.unit} in stock` };
});
