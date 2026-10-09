import "server-only";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { can, type Permission } from "./permissions";
import { getSessionUser, type SessionUser } from "./session";
import { ActionError, AuthError } from "@/lib/errors";

export { ActionError, AuthError };


// ── Pages / layouts (redirect on failure) ──

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/forbidden");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/forbidden");
  return user;
}

/** Student self-service pages: the signed-in user must be a student linked to a Student record. */
export async function requireStudentSelf(): Promise<SessionUser & { studentId: string }> {
  const user = await requireUser();
  if (user.role !== "STUDENT" || !user.studentId) redirect("/forbidden");
  return user as SessionUser & { studentId: string };
}

// ── Server actions / route handlers (throw on failure) ──

export async function authorize(permission?: Permission | Permission[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Your session has expired. Please sign in again.");
  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission];
    if (!list.some((p) => can(user.role, p))) throw new AuthError();
  }
  return user;
}
