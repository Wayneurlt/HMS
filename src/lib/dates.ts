/**
 * Date helpers. Safe for both server and client.
 *
 * Calendar-day values (rent months, due dates, overnight nights, meal days) are stored as
 * Postgres DATE and represented in JS as a Date at 00:00 UTC of that day. "Today" is always
 * computed in the hostel's timezone so a server running in UTC behaves like the hostel clock.
 */

export const HOSTEL_TZ = process.env.NEXT_PUBLIC_HOSTEL_TIMEZONE || "Africa/Nairobi";

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" of the current day (or of `at`) in the hostel timezone. */
export function todayISO(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HOSTEL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Today in the hostel timezone, as a date-only value (00:00 UTC). */
export function today(): Date {
  return parseDateOnly(todayISO());
}

/** Parse "YYYY-MM-DD" into a date-only value. Throws on invalid input. */
export function parseDateOnly(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Invalid date: ${iso}`);
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) {
    throw new Error(`Invalid date: ${iso}`);
  }
  return d;
}

/** Date-only value → "YYYY-MM-DD". */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Whole days from a to b (b - a) for date-only values. */
export function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function addMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
}

export function monthEnd(d: Date): Date {
  return addDays(addMonths(d, 1), -1);
}

export function daysInMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Due date for a rent month: `dueDay` of that month, clamped to the month length. */
export function dueDateFor(periodMonth: Date, dueDay: number): Date {
  const day = Math.min(Math.max(1, dueDay), daysInMonth(periodMonth));
  return new Date(Date.UTC(periodMonth.getUTCFullYear(), periodMonth.getUTCMonth(), day));
}

/** List of month starts from `from` to `to` inclusive. */
export function monthsBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let m = monthStart(from);
  const end = monthStart(to);
  while (m.getTime() <= end.getTime()) {
    out.push(m);
    m = addMonths(m, 1);
  }
  return out;
}

// ── Formatting ──

/** Format a date-only value, e.g. "7 Oct 2026". */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Long weekday format for a date-only value, e.g. "Wednesday, 7 October". */
export function formatDayLong(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

/** Short weekday, e.g. "Wed 7 Oct". */
export function formatDayShort(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

/** Month label for a month-start date-only value, e.g. "Oct 2026". */
export function formatMonth(d: Date | string, style: "short" | "long" = "short"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    month: style,
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Format a real timestamp in hostel time, e.g. "7 Oct 2026, 14:05". */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: HOSTEL_TZ,
  }).format(date);
}

/** "3 hours ago" style relative time for timestamps. */
export function timeAgo(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const secs = Math.round((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDateTime(date);
}
