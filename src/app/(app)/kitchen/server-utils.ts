import "server-only";
import { revalidatePath } from "next/cache";
import { monthStart, parseDateOnly, today } from "@/lib/dates";

/** Revalidate every kitchen page plus the admin dashboard after a kitchen mutation. */
export function revalidateKitchen() {
  revalidatePath("/kitchen", "layout");
  revalidatePath("/dashboard");
}

function safeDate(v: string | undefined): Date | null {
  if (!v) return null;
  try {
    return parseDateOnly(v);
  } catch {
    return null;
  }
}

/** Date range from ?from=&to= search params; defaults to the current month to date. */
export function parseRange(from: string | undefined, to: string | undefined): { from: Date; to: Date } {
  const t = today();
  let f = safeDate(from) ?? monthStart(t);
  let e = safeDate(to) ?? t;
  if (f.getTime() > e.getTime()) [f, e] = [e, f];
  return { from: f, to: e };
}
