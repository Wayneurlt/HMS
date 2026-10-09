"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { defineAction } from "@/lib/action";
import { ActionError } from "@/lib/auth/guards";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import { zId, zOptText, zText } from "@/lib/validation/common";

function revalidateRooms() {
  revalidatePath("/rooms");
  revalidatePath("/students");
  revalidatePath("/dashboard");
}

const roomSchema = z.object({
  name: zText(60, "Room name"),
  floor: zOptText(60),
  description: zOptText(500),
});

export const createRoom = defineAction({ permission: "rooms.manage", schema: roomSchema }, async (input, user) => {
  const existing = await db.room.findUnique({ where: { name: input.name } });
  if (existing && !existing.deletedAt) {
    throw new ActionError("A room with that name already exists.", { name: ["Name already in use"] });
  }
  const room = await db.$transaction(async (tx) => {
    // A previously removed room with the same name is restored instead (names are unique).
    const room = existing
      ? await tx.room.update({
          where: { id: existing.id },
          data: { deletedAt: null, isActive: true, floor: input.floor, description: input.description },
        })
      : await tx.room.create({ data: { name: input.name, floor: input.floor, description: input.description } });
    await logActivity(tx, {
      userId: user.id,
      action: ACTIONS.ROOM_CREATED,
      entityType: "Room",
      entityId: room.id,
      details: { name: room.name, floor: room.floor, restored: !!existing },
    });
    return room;
  });
  revalidateRooms();
  return { message: existing ? `${room.name} restored` : `${room.name} created` };
});

export const updateRoom = defineAction(
  { permission: "rooms.manage", schema: roomSchema.extend({ id: zId() }) },
  async (input, user) => {
    const room = await db.room.findUnique({ where: { id: input.id } });
    if (!room || room.deletedAt) throw new ActionError("Room not found.");
    if (input.name !== room.name) {
      const clash = await db.room.findUnique({ where: { name: input.name } });
      if (clash) {
        throw new ActionError(
          clash.deletedAt ? "A removed room still uses that name. Choose another." : "A room with that name already exists.",
          { name: ["Name already in use"] },
        );
      }
    }
    await db.room.update({
      where: { id: room.id },
      data: { name: input.name, floor: input.floor, description: input.description },
    });
    await logActivity(db, {
      userId: user.id,
      action: ACTIONS.ROOM_UPDATED,
      entityType: "Room",
      entityId: room.id,
      details: { from: room.name, name: input.name, floor: input.floor, description: input.description },
    });
    revalidateRooms();
    return { message: "Room updated" };
  },
);

async function occupiedBedCount(roomId: string) {
  return db.accommodation.count({ where: { isActive: true, bed: { roomId } } });
}

export const setRoomActive = defineAction(
  { permission: "rooms.manage", schema: z.object({ id: zId(), active: z.enum(["true", "false"]) }) },
  async (input, user) => {
    const room = await db.room.findUnique({ where: { id: input.id } });
    if (!room || room.deletedAt) throw new ActionError("Room not found.");
    const active = input.active === "true";
    if (!active && (await occupiedBedCount(room.id)) > 0) {
      throw new ActionError("This room has occupied beds. Move or check out the students first.");
    }
    await db.room.update({ where: { id: room.id }, data: { isActive: active } });
    await logActivity(db, {
      userId: user.id,
      action: ACTIONS.ROOM_UPDATED,
      entityType: "Room",
      entityId: room.id,
      details: { name: room.name, isActive: active },
    });
    revalidateRooms();
    return { message: active ? `${room.name} reactivated` : `${room.name} deactivated` };
  },
);

export const deleteRoom = defineAction(
  { permission: "rooms.manage", schema: z.object({ id: zId() }) },
  async (input, user) => {
    const room = await db.room.findUnique({ where: { id: input.id } });
    if (!room || room.deletedAt) throw new ActionError("Room not found.");
    if ((await occupiedBedCount(room.id)) > 0) {
      throw new ActionError("This room has occupied beds. Move or check out the students first.");
    }
    // Soft delete: stays and rent history keep pointing at the room and its beds.
    await db.room.update({ where: { id: room.id }, data: { deletedAt: new Date(), isActive: false } });
    await logActivity(db, {
      userId: user.id,
      action: ACTIONS.ROOM_DELETED,
      entityType: "Room",
      entityId: room.id,
      details: { name: room.name },
    });
    revalidateRooms();
    return { message: `${room.name} removed` };
  },
);

// ───────── Beds ─────────

const MANUAL_STATUSES = ["AVAILABLE", "RESERVED", "MAINTENANCE"] as const;

const addBedsSchema = z.object({
  roomId: zId(),
  labels: zText(400, "Bed label").transform((s) =>
    [...new Set(s.split(",").map((l) => l.trim()).filter(Boolean))],
  ).pipe(
    z
      .array(z.string().max(30, "Each label must be at most 30 characters"))
      .min(1, "Enter at least one label")
      .max(20, "Add at most 20 beds at a time"),
  ),
});

export const addBeds = defineAction(
  { permission: "rooms.manage", schema: addBedsSchema },
  async (input, user) => {
    const room = await db.room.findUnique({ where: { id: input.roomId } });
    if (!room || room.deletedAt) throw new ActionError("Room not found.");
    const existing = await db.bed.findMany({ where: { roomId: room.id, label: { in: input.labels } } });
    const live = existing.filter((b) => !b.deletedAt).map((b) => b.label);
    if (live.length) {
      throw new ActionError(`${room.name} already has ${live.join(", ")}.`, {
        labels: [`Already exists: ${live.join(", ")}`],
      });
    }
    const removed = new Map(existing.map((b) => [b.label, b]));
    await db.$transaction(async (tx) => {
      for (const label of input.labels) {
        const old = removed.get(label);
        // (roomId,label) is unique, so a previously removed bed is restored instead.
        const bed = old
          ? await tx.bed.update({ where: { id: old.id }, data: { deletedAt: null, status: "AVAILABLE" } })
          : await tx.bed.create({ data: { roomId: room.id, label } });
        await logActivity(tx, {
          userId: user.id,
          action: ACTIONS.BED_CREATED,
          entityType: "Bed",
          entityId: bed.id,
          details: { room: room.name, bed: label, restored: !!old },
        });
      }
    });
    revalidateRooms();
    const n = input.labels.length;
    return { message: `${n} bed${n === 1 ? "" : "s"} added to ${room.name}` };
  },
);

export const updateBed = defineAction(
  {
    permission: "rooms.manage",
    schema: z.object({
      id: zId(),
      label: zText(30, "Bed label"),
      status: z.enum(MANUAL_STATUSES).optional(),
      notes: zOptText(300),
    }),
  },
  async (input, user) => {
    const bed = await db.bed.findUnique({
      where: { id: input.id },
      include: { room: true, activeAccommodation: { select: { id: true } } },
    });
    if (!bed || bed.deletedAt || bed.room.deletedAt) throw new ActionError("Bed not found.");
    if (input.label !== bed.label) {
      const clash = await db.bed.findUnique({ where: { roomId_label: { roomId: bed.roomId, label: input.label } } });
      if (clash) {
        throw new ActionError(`${bed.room.name} already has a bed called "${input.label}".`, {
          label: [clash.deletedAt ? "Used by a removed bed in this room" : "Label already in use in this room"],
        });
      }
    }
    let status = bed.status;
    if (input.status && input.status !== bed.status) {
      if (bed.activeAccommodation || bed.status === "OCCUPIED") {
        throw new ActionError("This bed is occupied. Its status changes automatically at check-out.", {
          status: ["Bed is occupied"],
        });
      }
      status = input.status;
    }
    await db.bed.update({ where: { id: bed.id }, data: { label: input.label, status, notes: input.notes } });
    await logActivity(db, {
      userId: user.id,
      action: ACTIONS.BED_UPDATED,
      entityType: "Bed",
      entityId: bed.id,
      details: {
        room: bed.room.name,
        bed: input.label,
        ...(input.label !== bed.label ? { renamedFrom: bed.label } : {}),
        ...(status !== bed.status ? { statusFrom: bed.status, status } : {}),
      },
    });
    revalidateRooms();
    return { message: "Bed updated" };
  },
);

export const deleteBed = defineAction(
  { permission: "rooms.manage", schema: z.object({ id: zId() }) },
  async (input, user) => {
    const bed = await db.bed.findUnique({
      where: { id: input.id },
      include: { room: true, activeAccommodation: { select: { id: true } } },
    });
    if (!bed || bed.deletedAt) throw new ActionError("Bed not found.");
    if (bed.activeAccommodation || bed.status === "OCCUPIED") {
      throw new ActionError("This bed is occupied. Move or check out the student first.");
    }
    await db.bed.update({ where: { id: bed.id }, data: { deletedAt: new Date() } });
    await logActivity(db, {
      userId: user.id,
      action: ACTIONS.BED_DELETED,
      entityType: "Bed",
      entityId: bed.id,
      details: { room: bed.room.name, bed: bed.label },
    });
    revalidateRooms();
    return { message: `${bed.room.name} · ${bed.label} removed` };
  },
);
