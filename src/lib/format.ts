/** Formatting helpers. Safe for both server and client. */

export const CURRENCY = "KES";

type DecimalLike = { toNumber(): number } | { toString(): string };

/** Convert a Prisma Decimal / number / string / null to a JS number (null → 0). */
export function toNumber(v: DecimalLike | number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  if ("toNumber" in v && typeof v.toNumber === "function") return v.toNumber();
  return Number(v.toString());
}

/** Round to 2 decimal places, avoiding float drift (e.g. 0.1 + 0.2). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatMoney(
  v: DecimalLike | number | string | null | undefined,
  opts: { decimals?: boolean; currency?: boolean } = {},
): string {
  const n = toNumber(v);
  const showDecimals = opts.decimals ?? !Number.isInteger(round2(n));
  const s = new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(n);
  return opts.currency === false ? s : `${CURRENCY} ${s}`;
}

/** Compact money for chart axes: 12.5k, 1.2M. */
export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatNumber(v: DecimalLike | number | string | null | undefined, maxDecimals = 2): string {
  return new Intl.NumberFormat("en-KE", { maximumFractionDigits: maxDecimals }).format(toNumber(v));
}

export function formatPercent(n: number, decimals = 0): string {
  return `${n.toFixed(decimals)}%`;
}

/** "HOSTEL_MANAGER" → "Hostel manager". */
export function humanize(value: string): string {
  const s = value.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Readable label for enum values used in the UI. */
export const LABELS: Record<string, string> = {
  OWNER: "Owner",
  HOSTEL_MANAGER: "Hostel manager",
  KITCHEN_STAFF: "Kitchen staff",
  STUDENT: "Student",
  MPESA: "M-Pesa",
  CASH: "Cash",
  BANK: "Bank",
  OTHER: "Other",
  PARTIALLY_PAID: "Partially paid",
  CHECKED_OUT: "Checked out",
  COOKING_FUEL: "Cooking fuel",
  CLEANING_SUPPLIES: "Cleaning supplies",
};

export function label(value: string | null | undefined): string {
  if (!value) return "—";
  return LABELS[value] ?? humanize(value);
}
