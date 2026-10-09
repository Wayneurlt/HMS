import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ActionError, authorize } from "@/lib/auth/guards";
import type { Permission } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/action-types";
import { checkRateLimit } from "@/lib/rate-limit";

export type { ActionResult } from "@/lib/action-types";

/**
 * Convert FormData to a plain object for zod parsing.
 *  - `name[]` keys collect into arrays
 *  - `name:json` keys are JSON-parsed (used for dynamic line items)
 *  - File entries are ignored (no uploads in V1)
 */
export function formDataToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of fd.entries()) {
    if (typeof value !== "string") continue;
    if (rawKey.startsWith("$ACTION")) continue;
    if (rawKey.endsWith("[]")) {
      const key = rawKey.slice(0, -2);
      ((out[key] as unknown[]) ??= []).push(value);
    } else if (rawKey.endsWith(":json")) {
      const key = rawKey.slice(0, -5);
      try {
        out[key] = JSON.parse(value);
      } catch {
        out[key] = undefined;
      }
    } else {
      out[rawKey] = value;
    }
  }
  return out;
}

function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

function prismaMessage(e: Prisma.PrismaClientKnownRequestError): string {
  switch (e.code) {
    case "P2002":
      return "That record already exists (a unique value is already in use).";
    case "P2003":
      return "This record is linked to other data and cannot be changed that way.";
    case "P2025":
      return "The record was not found. It may have been changed or removed.";
    case "P2034":
      return "Another change happened at the same time. Please try again.";
    default:
      return "A database error occurred. Please try again.";
  }
}

type ActionOptions<S extends z.ZodType> = {
  permission?: Permission | Permission[];
  schema: S;
  /** Optional per-user rate limit, e.g. { key: "overnight", limit: 30, windowMs: 60_000 }. */
  rateLimit?: { key: string; limit: number; windowMs: number };
};

/**
 * Define a server action with authorization + validation + uniform error handling.
 *
 * The returned function accepts FormData or a plain object and resolves to ActionResult.
 * Use inside a "use server" file:
 *
 *   export const createRoom = defineAction(
 *     { permission: "rooms.manage", schema: roomSchema },
 *     async (input, user) => { ...; return { message: "Room created" }; },
 *   );
 */
export function defineAction<S extends z.ZodType, R = void>(
  opts: ActionOptions<S>,
  handler: (input: z.output<S>, user: SessionUser) => Promise<{ message?: string; data?: R } | void>,
) {
  return async (input: FormData | Record<string, unknown>): Promise<ActionResult<R>> => {
    try {
      const user = await authorize(opts.permission);
      if (opts.rateLimit) {
        const ok = checkRateLimit(`action:${opts.rateLimit.key}:${user.id}`, opts.rateLimit.limit, opts.rateLimit.windowMs);
        if (!ok) return { ok: false, error: "Too many requests. Please slow down and try again." };
      }
      const raw = input instanceof FormData ? formDataToObject(input) : input;
      const parsed = opts.schema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: "Please correct the highlighted fields.",
          fieldErrors: zodFieldErrors(parsed.error),
        };
      }
      const result = await handler(parsed.data, user);
      return { ok: true, message: result?.message, data: result?.data };
    } catch (e) {
      if (e instanceof ActionError) {
        return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        console.error("[action] prisma error", e.code, e.meta);
        return { ok: false, error: prismaMessage(e) };
      }
      // Let Next.js redirect()/notFound() propagate.
      if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) {
        throw e;
      }
      console.error("[action] unexpected error", e);
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };
}
