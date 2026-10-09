"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma, type Role } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { phoneVariants } from "@/lib/phone";
import { defineAction } from "@/lib/action";
import { ActionError } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { manageableRoles } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import { zCheckbox, zEmail, zId, zPassword, zPhone, zText } from "@/lib/validation/common";

const ROLES = ["OWNER", "HOSTEL_MANAGER", "KITCHEN_STAFF", "STUDENT"] as const;

/** Readable temporary password: letters + digits, no look-alike characters. */
function generatePassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const chars = [letters[randomInt(letters.length)]!, digits[randomInt(digits.length)]!];
  while (chars.length < 12) chars.push(all[randomInt(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

const optPassword = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), zPassword().optional());

const contactSchema = {
  name: zText(100, "Name"),
  email: zEmail(false),
  phone: zPhone(false),
};

function requireContact(v: { email: string | null; phone: string | null }, ctx: z.RefinementCtx) {
  if (!v.email && !v.phone) {
    ctx.addIssue({ code: "custom", path: ["email"], message: "Enter an email or a phone number" });
    ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter an email or a phone number" });
  }
}

/** Throw field errors for email/phone already used by another account. */
async function assertUniqueContact(client: Tx | typeof db, email: string | null, phone: string | null, exceptId?: string) {
  const fieldErrors: Record<string, string[]> = {};
  if (email) {
    const u = await client.user.findFirst({ where: { email, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { id: true } });
    if (u) fieldErrors.email = ["Another account already uses this email"];
  }
  if (phone) {
    const u = await client.user.findFirst({
      where: { phone: { in: phoneVariants(phone) }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (u) fieldErrors.phone = ["Another account already uses this phone number"];
  }
  if (Object.keys(fieldErrors).length) throw new ActionError("That email or phone is already in use.", fieldErrors);
}

function uniqueViolation(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    const target = String((e.meta as { target?: unknown } | undefined)?.target ?? "");
    const fieldErrors: Record<string, string[]> = {};
    if (target.includes("email")) fieldErrors.email = ["Another account already uses this email"];
    if (target.includes("phone")) fieldErrors.phone = ["Another account already uses this phone number"];
    if (target.includes("userId")) fieldErrors.studentId = ["This student already has a login"];
    throw new ActionError("That value is already in use.", fieldErrors);
  }
  throw e;
}

/** Load a target user and check the actor may manage that account's role. */
async function loadManageable(actor: SessionUser, id: string) {
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, isActive: true, email: true, phone: true, student: { select: { id: true, status: true } } },
  });
  if (!target) throw new ActionError("User not found.");
  if (!manageableRoles(actor.role).includes(target.role)) {
    throw new ActionError("You can only manage student accounts.");
  }
  return target;
}

async function activeOwnerCount(client: Tx | typeof db) {
  return client.user.count({ where: { role: "OWNER", isActive: true } });
}

// ───────── Create (owner) ─────────

const createSchema = z
  .object({
    ...contactSchema,
    role: z.enum(ROLES, { error: "Choose a role" }),
    studentId: z.preprocess((v) => (v === "" ? undefined : v), zId().optional()),
    password: optPassword,
  })
  .superRefine((v, ctx) => {
    requireContact(v, ctx);
    if (v.role === "STUDENT" && !v.studentId) {
      ctx.addIssue({ code: "custom", path: ["studentId"], message: "Choose the student this login belongs to" });
    }
  });

export const createUser = defineAction(
  { permission: "users.manage", schema: createSchema },
  async (input, actor) => {
    if (!manageableRoles(actor.role).includes(input.role as Role)) throw new ActionError("You cannot create that kind of account.");
    const password = input.password ?? generatePassword();
    const passwordHash = await hashPassword(password);

    const user = await db
      .$transaction(async (tx) => {
        await assertUniqueContact(tx, input.email, input.phone);
        let studentId: string | null = null;
        if (input.role === "STUDENT") {
          const student = await tx.student.findUnique({
            where: { id: input.studentId! },
            select: { id: true, userId: true, status: true, deletedAt: true, fullName: true },
          });
          if (!student || student.deletedAt) throw new ActionError("Student not found.", { studentId: ["Student not found"] });
          if (student.userId) throw new ActionError("This student already has a login.", { studentId: ["Already has a login"] });
          if (student.status === "CHECKED_OUT") {
            throw new ActionError("Checked-out students cannot be given a login.", { studentId: ["Student has checked out"] });
          }
          studentId = student.id;
        }
        const created = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            phone: input.phone,
            role: input.role,
            passwordHash,
            mustChangePassword: true,
          },
        });
        if (studentId) {
          // Guarded update: fails if another request linked the student meanwhile.
          const linked = await tx.student.updateMany({ where: { id: studentId, userId: null }, data: { userId: created.id } });
          if (linked.count === 0) throw new ActionError("This student already has a login.", { studentId: ["Already has a login"] });
        }
        await logActivity(tx, {
          userId: actor.id,
          action: ACTIONS.USER_CREATED,
          entityType: "User",
          entityId: created.id,
          details: { name: created.name, role: created.role, email: created.email, phone: created.phone, studentId },
        });
        return created;
      })
      .catch(uniqueViolation);

    revalidatePath("/users");
    return {
      message: `Account created for ${user.name}`,
      data: { name: user.name, login: user.email ?? user.phone ?? "", password },
    };
  },
);

// ───────── Edit (owner) ─────────

const updateSchema = z
  .object({ id: zId(), ...contactSchema, role: z.enum(ROLES, { error: "Choose a role" }) })
  .superRefine(requireContact);

export const updateUser = defineAction(
  { permission: "users.manage", schema: updateSchema },
  async (input, actor) => {
    const target = await loadManageable(actor, input.id);
    const roleChanged = target.role !== input.role;
    if (roleChanged) {
      if (target.id === actor.id) throw new ActionError("You cannot change your own role.", { role: ["You cannot change your own role"] });
      if (target.role === "STUDENT" || input.role === "STUDENT") {
        throw new ActionError("Student logins are linked to a student record and cannot change role.", {
          role: ["Student accounts keep the Student role"],
        });
      }
      if (!manageableRoles(actor.role).includes(input.role)) throw new ActionError("You cannot assign that role.");
    }

    await db
      .$transaction(async (tx) => {
        if (roleChanged && target.role === "OWNER" && target.isActive) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(424243)`;
          if ((await activeOwnerCount(tx)) <= 1) {
            throw new ActionError("This is the last active owner. Add another owner first.", { role: ["Last active owner"] });
          }
        }
        await assertUniqueContact(tx, input.email, input.phone, target.id);
        await tx.user.update({
          where: { id: target.id },
          data: { name: input.name, email: input.email, phone: input.phone, role: input.role },
        });
        const changes: Record<string, { from: string | null; to: string | null }> = {};
        if (target.name !== input.name) changes.name = { from: target.name, to: input.name };
        if (target.email !== input.email) changes.email = { from: target.email, to: input.email };
        if (target.phone !== input.phone) changes.phone = { from: target.phone, to: input.phone };
        if (roleChanged) changes.role = { from: target.role, to: input.role };
        await logActivity(tx, {
          userId: actor.id,
          action: ACTIONS.USER_UPDATED,
          entityType: "User",
          entityId: target.id,
          details: { name: input.name, changes },
        });
        // A role change alters what the user may do: sign them out everywhere.
        if (roleChanged) await tx.session.deleteMany({ where: { userId: target.id } });
      })
      .catch(uniqueViolation);

    revalidatePath("/users");
    return { message: "User updated" };
  },
);

// ───────── Activate / deactivate (owner: anyone; manager: students) ─────────

export const setUserActive = defineAction(
  { permission: "users.view", schema: z.object({ id: zId(), active: zCheckbox() }) },
  async (input, actor) => {
    const target = await loadManageable(actor, input.id);
    if (target.id === actor.id) throw new ActionError("You cannot deactivate your own account.");
    if (target.isActive === input.active) return { message: input.active ? "Already active" : "Already inactive" };
    if (input.active && target.role === "STUDENT" && target.student?.status === "CHECKED_OUT") {
      throw new ActionError("This student has checked out. Check them in again before re-enabling the login.");
    }

    await db.$transaction(async (tx) => {
      if (!input.active && target.role === "OWNER") {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(424243)`;
        if ((await activeOwnerCount(tx)) <= 1) throw new ActionError("This is the last active owner and cannot be deactivated.");
      }
      await tx.user.update({ where: { id: target.id }, data: { isActive: input.active } });
      if (!input.active) await tx.session.deleteMany({ where: { userId: target.id } });
      await logActivity(tx, {
        userId: actor.id,
        action: ACTIONS.USER_UPDATED,
        entityType: "User",
        entityId: target.id,
        details: { name: target.name, isActive: input.active, sessionsRevoked: !input.active },
      });
    });

    revalidatePath("/users");
    return { message: input.active ? `${target.name} can sign in again` : `${target.name} has been deactivated and signed out` };
  },
);

// ───────── Reset password (owner: anyone; manager: students) ─────────

export const resetUserPassword = defineAction(
  {
    permission: "users.view",
    schema: z.object({ id: zId() }),
    rateLimit: { key: "reset-password", limit: 20, windowMs: 15 * 60_000 },
  },
  async (input, actor) => {
    const target = await loadManageable(actor, input.id);
    if (target.id === actor.id) throw new ActionError("Change your own password from the Account page.");
    const password = generatePassword();
    const passwordHash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { passwordHash, mustChangePassword: true } });
      await tx.session.deleteMany({ where: { userId: target.id } });
      await logActivity(tx, {
        userId: actor.id,
        action: ACTIONS.USER_PASSWORD_RESET,
        entityType: "User",
        entityId: target.id,
        details: { name: target.name, role: target.role },
      });
    });
    revalidatePath("/users");
    return {
      message: `Password reset for ${target.name}`,
      data: { name: target.name, login: target.email ?? target.phone ?? "", password },
    };
  },
);
