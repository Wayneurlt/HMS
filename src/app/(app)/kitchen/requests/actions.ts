"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { defineAction } from "@/lib/action";
import { ActionError } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { today } from "@/lib/dates";
import { formatNumber, round2 } from "@/lib/format";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import { recordPurchase } from "@/lib/services/inventory";
import { notifyRoles, notifyUsers } from "@/lib/services/notifications";
import { cleanText, zId, zOptDate, zOptText } from "@/lib/validation/common";
import { PRIORITIES } from "../constants";
import { revalidateKitchen } from "../server-utils";

const optNum = (schema: z.ZodType<number>) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), schema.optional()).transform((v) => v ?? null);

const lineSchema = z.object({
  inventoryItemId: z.preprocess((v) => (v === "" ? undefined : v), zId().optional()).transform((v) => v ?? null),
  name: z.string().max(80, "At most 80 characters").transform(cleanText).default(""),
  quantity: z.coerce
    .number({ error: "Quantity is required" })
    .refine((n) => Number.isFinite(n) && n > 0, "Must be greater than 0")
    .refine((n) => n <= 1_000_000, "Quantity is too large"),
  unit: z.string().max(20, "At most 20 characters").transform(cleanText).default(""),
  estimatedCost: optNum(
    z.coerce
      .number()
      .refine((n) => Number.isFinite(n) && n >= 0, "Cannot be negative")
      .refine((n) => n <= 10_000_000, "Amount is too large"),
  ),
});

const createSchema = z.object({
  items: z
    .array(lineSchema, { error: "Add at least one item" })
    .min(1, "Add at least one item")
    .max(30, "At most 30 items per request")
    .superRefine((lines, ctx) => {
      lines.forEach((l, i) => {
        if (!l.inventoryItemId && !l.name) ctx.addIssue({ code: "custom", path: [i, "name"], message: "Choose an item or type a name" });
        if (!l.inventoryItemId && !l.unit) ctx.addIssue({ code: "custom", path: [i, "unit"], message: "Unit is required" });
      });
    }),
  reason: zOptText(500),
  priority: z.enum(PRIORITIES, { error: "Choose a priority" }),
  neededBy: zOptDate("Needed by"),
});

export const createShoppingRequest = defineAction({ permission: "shopping.create", schema: createSchema }, async (input, user) => {
  if (input.neededBy && input.neededBy.getTime() < today().getTime()) {
    throw new ActionError("The needed-by date cannot be in the past.", { neededBy: ["Cannot be in the past"] });
  }
  const ids = [...new Set(input.items.map((l) => l.inventoryItemId).filter((v): v is string => !!v))];
  const stock = await db.inventoryItem.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, name: true, unit: true } });
  const byId = new Map(stock.map((s) => [s.id, s]));
  const lines = input.items.map((l, i) => {
    if (l.inventoryItemId) {
      const s = byId.get(l.inventoryItemId);
      if (!s) throw new ActionError("One of the selected items no longer exists.", { [`items.${i}.inventoryItemId`]: ["Item not found"] });
      return { inventoryItemId: s.id, name: s.name, unit: s.unit, quantity: l.quantity, estimatedCost: l.estimatedCost === null ? null : round2(l.estimatedCost) };
    }
    return { inventoryItemId: null, name: l.name, unit: l.unit, quantity: l.quantity, estimatedCost: l.estimatedCost === null ? null : round2(l.estimatedCost) };
  });
  const summary = lines.map((l) => `${formatNumber(l.quantity, 3)} ${l.unit} ${l.name}`).join(", ");

  await db.$transaction(async (tx) => {
    const req = await tx.shoppingRequest.create({
      data: {
        reason: input.reason,
        priority: input.priority,
        neededBy: input.neededBy,
        requestedById: user.id,
        items: { create: lines },
      },
    });
    await notifyRoles(tx, ["OWNER", "HOSTEL_MANAGER"], {
      type: "SHOPPING_REQUEST_NEW",
      title: `${input.priority === "URGENT" ? "Urgent shopping" : "Shopping"} request from ${user.name}`,
      message: summary.slice(0, 300),
      link: "/kitchen/requests",
      dedupeKey: `shopping:${req.id}:new`,
    });
    await logActivity(tx, {
      userId: user.id,
      action: ACTIONS.SHOPPING_REQUEST_CREATED,
      entityType: "ShoppingRequest",
      entityId: req.id,
      details: { priority: input.priority, items: summary.slice(0, 500) },
    });
  });
  revalidateKitchen();
  return { message: "Shopping request sent for approval" };
});

export const reviewShoppingRequest = defineAction(
  {
    permission: "shopping.review",
    schema: z.object({ id: zId(), decision: z.enum(["APPROVE", "REJECT"]), note: zOptText(500) }),
  },
  async (input, user) => {
    const approve = input.decision === "APPROVE";
    await db.$transaction(async (tx) => {
      const req = await tx.shoppingRequest.findUnique({ where: { id: input.id }, include: { items: { select: { name: true } } } });
      if (!req) throw new ActionError("Shopping request not found.");
      const res = await tx.shoppingRequest.updateMany({
        where: { id: input.id, status: "PENDING" },
        data: { status: approve ? "APPROVED" : "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: input.note },
      });
      if (res.count === 0) throw new ActionError("Only pending requests can be reviewed.");
      if (req.requestedById) {
        const items = req.items.map((i) => i.name).join(", ");
        await notifyUsers(tx, [req.requestedById], {
          type: approve ? "SHOPPING_REQUEST_APPROVED" : "SHOPPING_REQUEST_REJECTED",
          title: approve ? "Shopping request approved" : "Shopping request rejected",
          message: `${items}${input.note ? ` — ${input.note}` : ""}`.slice(0, 500),
          link: "/kitchen/requests",
          dedupeKey: `shopping:${req.id}:${approve ? "approved" : "rejected"}`,
        });
      }
      await logActivity(tx, {
        userId: user.id,
        action: approve ? ACTIONS.SHOPPING_REQUEST_APPROVED : ACTIONS.SHOPPING_REQUEST_REJECTED,
        entityType: "ShoppingRequest",
        entityId: req.id,
        details: { note: input.note },
      });
    });
    revalidateKitchen();
    return { message: approve ? "Request approved" : "Request rejected" };
  },
);

export const cancelShoppingRequest = defineAction(
  { permission: "shopping.view", schema: z.object({ id: zId() }) },
  async (input, user) => {
    const req = await db.shoppingRequest.findUnique({ where: { id: input.id } });
    if (!req) throw new ActionError("Shopping request not found.");
    if (req.requestedById !== user.id && user.role !== "OWNER") {
      throw new ActionError("Only the person who made the request (or the owner) can cancel it.");
    }
    await db.$transaction(async (tx) => {
      const res = await tx.shoppingRequest.updateMany({
        where: { id: input.id, status: { in: ["PENDING", "APPROVED"] } },
        data: { status: "CANCELLED" },
      });
      if (res.count === 0) throw new ActionError("Only pending or approved requests can be cancelled.");
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.SHOPPING_REQUEST_CANCELLED,
        entityType: "ShoppingRequest",
        entityId: input.id,
        details: { previousStatus: req.status },
      });
    });
    revalidateKitchen();
    return { message: "Request cancelled" };
  },
);

const purchasedLine = z.object({
  inventoryItemId: zId(),
  quantity: z.coerce.number().refine((n) => Number.isFinite(n) && n > 0, "Must be greater than 0").refine((n) => n <= 1_000_000, "Too large"),
  unitCost: z.coerce
    .number()
    .refine((n) => Number.isFinite(n) && n > 0, "Must be greater than 0")
    .refine((n) => n <= 10_000_000, "Too large")
    .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "At most 2 decimal places"),
});

const markPurchasedSchema = z.object({
  id: zId(),
  lines: z.array(purchasedLine).max(30).optional().default([]),
  supplier: zOptText(120),
  purchaseDate: zOptDate("Purchase date"),
  reference: zOptText(100),
});

/** APPROVED → PURCHASED, optionally recording a stock purchase per line in the same transaction. */
export const markRequestPurchased = defineAction(
  { permission: ["shopping.create", "shopping.review"], schema: markPurchasedSchema },
  async (input, user) => {
    if (input.lines.length > 0) {
      if (!can(user.role, "purchases.record")) throw new ActionError("You are not allowed to record purchases.");
      if (!input.purchaseDate) throw new ActionError("Enter the purchase date.", { purchaseDate: ["Purchase date is required"] });
      if (input.purchaseDate.getTime() > today().getTime()) {
        throw new ActionError("The purchase date cannot be in the future.", { purchaseDate: ["Cannot be in the future"] });
      }
    }
    const recorded = await db.$transaction(async (tx) => {
      const req = await tx.shoppingRequest.findUnique({ where: { id: input.id }, include: { items: true } });
      if (!req) throw new ActionError("Shopping request not found.");
      if (req.status !== "APPROVED") throw new ActionError("Only approved requests can be marked as purchased.");
      const allowed = new Set(req.items.map((i) => i.inventoryItemId).filter(Boolean));
      for (const line of input.lines) {
        if (!allowed.has(line.inventoryItemId)) throw new ActionError("A purchase line does not belong to this request.");
        await recordPurchase(
          {
            itemId: line.inventoryItemId,
            quantity: line.quantity,
            unitCost: line.unitCost,
            supplier: input.supplier,
            purchaseDate: input.purchaseDate!,
            reference: input.reference,
            notes: "Bought for shopping request",
            shoppingRequestId: req.id,
          },
          user.id,
          tx,
        );
      }
      const res = await tx.shoppingRequest.updateMany({ where: { id: req.id, status: "APPROVED" }, data: { status: "PURCHASED" } });
      if (res.count === 0) throw new ActionError("The request changed. Please reload and try again.");
      await logActivity(tx, {
        userId: user.id,
        action: ACTIONS.SHOPPING_REQUEST_PURCHASED,
        entityType: "ShoppingRequest",
        entityId: req.id,
        details: { purchasesRecorded: input.lines.length },
      });
      return input.lines.length;
    });
    revalidateKitchen();
    return {
      message: recorded ? `Marked as purchased — ${recorded} purchase${recorded === 1 ? "" : "s"} added to stock` : "Request marked as purchased",
    };
  },
);

