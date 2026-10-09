"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import type { ActionResult } from "@/lib/action-types";
import { defineAction } from "@/lib/action";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ActionError } from "@/lib/auth/guards";
import { normalizePhone, phoneVariants } from "@/lib/phone";
import { homePathFor } from "@/lib/auth/permissions";
import { clientIp, createSession, destroySession, getSessionUser, revokeUserSessions } from "@/lib/auth/session";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import { ensureDefaultReminderRules } from "@/lib/services/reminders";
import { getSettings } from "@/lib/services/settings";
import { zEmail, zPassword, zPhone, zText } from "@/lib/validation/common";

const MAX_FAILS_PER_ID = 5;
const MAX_FAILS_PER_IP = 20;
const WINDOW_MS = 15 * 60 * 1000;

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or phone").max(200),
  password: z.string().min(1, "Enter your password").max(200),
});

/** Emails are case-insensitive; phones match in any format (0712…, 254712…, +254712…). */
function normaliseIdentifier(id: string): { key: string; email?: string; phones?: string[] } {
  if (id.includes("@")) return { key: id.toLowerCase(), email: id.toLowerCase() };
  return { key: normalizePhone(id), phones: phoneVariants(id) };
}

export async function loginAction(fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  const parsed = loginSchema.safeParse({ identifier: fd.get("identifier"), password: fd.get("password") });
  if (!parsed.success) {
    return { ok: false, error: "Enter your email/phone and password." };
  }
  const { identifier, password } = parsed.data;
  const where = normaliseIdentifier(identifier);
  const key = where.key;
  const ip = await clientIp();
  const since = new Date(Date.now() - WINDOW_MS);

  const [failsForId, failsForIp] = await Promise.all([
    db.loginAttempt.count({ where: { identifier: key, success: false, createdAt: { gte: since } } }),
    ip ? db.loginAttempt.count({ where: { ipAddress: ip, success: false, createdAt: { gte: since } } }) : 0,
  ]);
  if (failsForId >= MAX_FAILS_PER_ID || failsForIp >= MAX_FAILS_PER_IP) {
    return { ok: false, error: "Too many failed attempts. Please wait 15 minutes and try again." };
  }

  const user = await db.user.findFirst({
    where: where.email ? { email: where.email } : { phone: { in: where.phones } },
  });
  // Always run bcrypt to keep response time constant whether or not the user exists.
  const valid = await verifyPassword(password, user?.passwordHash ?? null);

  if (!user || !valid || !user.isActive) {
    await db.loginAttempt.create({ data: { identifier: key, ipAddress: ip, success: false } });
    if (user) {
      await logActivity(db, {
        userId: user.id,
        action: ACTIONS.LOGIN_FAILED,
        entityType: "User",
        entityId: user.id,
        ipAddress: ip,
        details: { reason: !user.isActive ? "inactive" : "bad_password" },
      });
    }
    return {
      ok: false,
      error: user && valid && !user.isActive ? "This account is disabled. Contact the hostel office." : "Incorrect email/phone or password.",
    };
  }

  await db.loginAttempt.create({ data: { identifier: key, ipAddress: ip, success: true } });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);
  await logActivity(db, { userId: user.id, action: ACTIONS.LOGIN, entityType: "User", entityId: user.id, ipAddress: ip });
  // Opportunistic cleanup of old attempts / sessions.
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  return { ok: true, data: { redirect: user.mustChangePassword ? "/account?first=1" : homePathFor(user.role) } };
}

export async function logoutAction(): Promise<void> {
  const user = await getSessionUser();
  if (user) {
    await logActivity(db, { userId: user.id, action: ACTIONS.LOGOUT, entityType: "User", entityId: user.id });
  }
  await destroySession();
  redirect("/login");
}

const setupSchema = z
  .object({
    name: zText(100, "Name"),
    email: zEmail(),
    phone: zPhone(false),
    password: zPassword(),
    confirm: z.string(),
    hostelName: zText(100, "Hostel name"),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

/** First-run setup: only works while no OWNER account exists. */
export async function setupOwnerAction(fd: FormData): Promise<ActionResult<{ redirect: string }>> {
  const parsed = setupSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of parsed.error.issues) (fieldErrors[i.path.join(".")] ??= []).push(i.message);
    return { ok: false, error: "Please correct the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;
  const passwordHash = await hashPassword(v.password);

  const created = await db.$transaction(async (tx) => {
    // Serialise concurrent setup attempts.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(424242)`;
    const owners = await tx.user.count({ where: { role: "OWNER" } });
    if (owners > 0) return null;
    const user = await tx.user.create({
      data: { name: v.name, email: v.email, phone: v.phone, passwordHash, role: "OWNER" },
    });
    await getSettings(tx);
    await tx.hostelSettings.update({ where: { id: 1 }, data: { hostelName: v.hostelName } });
    await logActivity(tx, { userId: user.id, action: ACTIONS.OWNER_SETUP, entityType: "User", entityId: user.id });
    return user;
  });
  if (!created) return { ok: false, error: "Setup has already been completed. Please sign in." };

  await ensureDefaultReminderRules();
  await createSession(created.id);
  return { ok: true, message: "Owner account created", data: { redirect: "/dashboard" } };
}

const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password").max(200),
    password: zPassword(),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" })
  .refine((v) => v.password !== v.current, { path: ["password"], message: "Choose a new password" });

export const changePasswordAction = defineAction(
  { schema: changePasswordSchema, rateLimit: { key: "change-password", limit: 10, windowMs: 15 * 60_000 } },
  async (input, sessionUser) => {
    const user = await db.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
    if (!(await verifyPassword(input.current, user.passwordHash))) {
      throw new ActionError("Current password is incorrect.", { current: ["Incorrect password"] });
    }
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password), mustChangePassword: false },
    });
    await revokeUserSessions(user.id, true);
    await logActivity(db, { userId: user.id, action: ACTIONS.PASSWORD_CHANGED, entityType: "User", entityId: user.id });
    return { message: "Password updated" };
  },
);
