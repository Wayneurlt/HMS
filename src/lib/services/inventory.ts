import "server-only";
import type { InventoryTransactionType } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { todayISO } from "@/lib/dates";
import { formatNumber, round2, toNumber } from "@/lib/format";
import { ACTIONS, logActivity } from "./activity";
import { notifyRoles } from "./notifications";

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

/** OUT_OF_STOCK when quantity ≤ 0, LOW_STOCK when quantity ≤ minimum, else IN_STOCK. */
export function stockStatus(quantity: number, minQuantity: number): StockStatus {
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (quantity <= minQuantity) return "LOW_STOCK";
  return "IN_STOCK";
}

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/**
 * Apply a signed stock movement with a row lock, write the ledger entry and raise
 * low/out-of-stock notifications when the status worsens.
 */
export async function moveStock(
  tx: Tx,
  input: {
    itemId: string;
    change: number;
    type: InventoryTransactionType;
    reason?: string | null;
    purchaseId?: string | null;
    userId: string | null;
  },
): Promise<{ balanceAfter: number; status: StockStatus }> {
  await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id = ${input.itemId} FOR UPDATE`;
  const item = await tx.inventoryItem.findUnique({ where: { id: input.itemId } });
  if (!item || item.deletedAt) throw new ActionError("Stock item not found.");

  const before = toNumber(item.currentQuantity);
  const after = round3(before + input.change);
  if (after < 0) {
    throw new ActionError(
      `Not enough ${item.name} in stock (${formatNumber(before, 3)} ${item.unit} available).`,
      { quantity: [`Only ${formatNumber(before, 3)} ${item.unit} available`] },
    );
  }

  await tx.inventoryItem.update({ where: { id: item.id }, data: { currentQuantity: after } });
  await tx.inventoryTransaction.create({
    data: {
      itemId: item.id,
      type: input.type,
      quantityChange: round3(input.change),
      balanceAfter: after,
      reason: input.reason ?? null,
      purchaseId: input.purchaseId ?? null,
      createdById: input.userId,
    },
  });

  const min = toNumber(item.minQuantity);
  const prevStatus = stockStatus(before, min);
  const status = stockStatus(after, min);
  if (status !== "IN_STOCK" && status !== prevStatus) {
    const out = status === "OUT_OF_STOCK";
    await notifyRoles(tx, ["OWNER", "KITCHEN_STAFF"], {
      type: out ? "OUT_OF_STOCK" : "LOW_STOCK",
      title: out ? `${item.name} is out of stock` : `${item.name} is running low`,
      message: out
        ? `${item.name} has run out. Consider raising a shopping request.`
        : `${item.name} is down to ${formatNumber(after, 3)} ${item.unit} (minimum ${formatNumber(min, 3)}).`,
      link: "/kitchen/stock",
      dedupeKey: `stock:${item.id}:${status}:${todayISO()}`,
    });
  }
  return { balanceAfter: after, status };
}

export type PurchaseInput = {
  itemId: string;
  quantity: number;
  unitCost: number;
  supplier: string | null;
  purchaseDate: Date;
  reference: string | null;
  notes: string | null;
  shoppingRequestId?: string | null;
};

/** Record a food/stock purchase: total = quantity × unit cost, and stock increases. */
export async function recordPurchase(input: PurchaseInput, userId: string, client?: Tx): Promise<{ purchaseId: string }> {
  const run = async (tx: Tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { id: input.itemId } });
    if (!item || item.deletedAt) throw new ActionError("Stock item not found.", { itemId: ["Select an item"] });
    const totalCost = round2(input.quantity * input.unitCost);
    const purchase = await tx.purchase.create({
      data: {
        itemId: item.id,
        quantity: round3(input.quantity),
        unit: item.unit,
        unitCost: round2(input.unitCost),
        totalCost,
        supplier: input.supplier ?? item.supplier,
        purchaseDate: input.purchaseDate,
        reference: input.reference,
        notes: input.notes,
        shoppingRequestId: input.shoppingRequestId ?? null,
        recordedById: userId,
      },
    });
    await moveStock(tx, {
      itemId: item.id,
      change: input.quantity,
      type: "PURCHASE",
      reason: `Purchase${input.supplier ? ` from ${input.supplier}` : ""}`,
      purchaseId: purchase.id,
      userId,
    });
    await logActivity(tx, {
      userId,
      action: ACTIONS.PURCHASE_RECORDED,
      entityType: "Purchase",
      entityId: purchase.id,
      details: {
        item: item.name,
        quantity: round3(input.quantity),
        unit: item.unit,
        unitCost: round2(input.unitCost),
        totalCost,
        supplier: input.supplier,
        reference: input.reference,
      },
    });
    return { purchaseId: purchase.id };
  };
  return client ? run(client) : db.$transaction(run);
}

/** Void a purchase (owner): reverses the stock it added. Fails if that stock was already used. */
export async function voidPurchase(purchaseId: string, reason: string, userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const p = await tx.purchase.findUnique({ where: { id: purchaseId }, include: { item: true } });
    if (!p) throw new ActionError("Purchase not found.");
    if (p.voidedAt) throw new ActionError("Purchase is already voided.");
    await moveStock(tx, {
      itemId: p.itemId,
      change: -toNumber(p.quantity),
      type: "ADJUSTMENT",
      reason: `Voided purchase: ${reason}`,
      purchaseId: p.id,
      userId,
    });
    await tx.purchase.update({ where: { id: p.id }, data: { voidedAt: new Date(), voidReason: reason } });
    await logActivity(tx, {
      userId,
      action: ACTIONS.PURCHASE_VOIDED,
      entityType: "Purchase",
      entityId: p.id,
      details: { item: p.item.name, quantity: toNumber(p.quantity), totalCost: toNumber(p.totalCost), reason },
    });
  });
}

/** Stock alerts for dashboards. */
export async function stockAlerts(client: Tx | typeof db = db) {
  const items = await client.inventoryItem.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true, unit: true, currentQuantity: true, minQuantity: true, category: true },
    orderBy: { name: "asc" },
  });
  const mapped = items.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    category: i.category,
    quantity: toNumber(i.currentQuantity),
    minQuantity: toNumber(i.minQuantity),
    status: stockStatus(toNumber(i.currentQuantity), toNumber(i.minQuantity)),
  }));
  return {
    low: mapped.filter((i) => i.status === "LOW_STOCK"),
    out: mapped.filter((i) => i.status === "OUT_OF_STOCK"),
    total: mapped.length,
  };
}
