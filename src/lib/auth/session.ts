import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "hms_session";
const SESSION_DAYS = 7;
const TOUCH_INTERVAL_MS = 15 * 60 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set (32+ characters) in production.");
  }
  return "insecure-development-session-secret-do-not-use";
}

/** Session tokens are random; only an HMAC of the token is stored in the database. */
function hashToken(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

export type SessionUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  mustChangePassword: boolean;
  studentId: string | null;
};

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** Create a session for the user and set the cookie. Call only from actions/route handlers. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const h = await headers();
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      ipAddress: await clientIp(),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Delete the current session and clear the cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

/** Revoke every session for a user (e.g. after password change or deactivation). */
export async function revokeUserSessions(userId: string, exceptCurrent = false): Promise<void> {
  let keepHash: string | undefined;
  if (exceptCurrent) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) keepHash = hashToken(token);
  }
  await db.session.deleteMany({
    where: { userId, ...(keepHash ? { NOT: { tokenHash: keepHash } } : {}) },
  });
}

/**
 * Resolve the signed-in user from the session cookie. Cached per request.
 * Returns null if there is no valid session or the user is inactive.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          student: { select: { id: true } },
        },
      },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now() || !session.user.isActive) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }

  const u = session.user;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    studentId: u.student?.id ?? null,
  };
});
