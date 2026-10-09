import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runRentReminders } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>`. Rejects when the secret is unset. */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  // Hash both sides so the buffers have equal length (timingSafeEqual requirement).
  const a = createHash("sha256").update(match[1]!).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runRentReminders();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[cron/reminders] failed", e);
    return NextResponse.json({ ok: false, error: "Reminder job failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
