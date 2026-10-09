import { z } from "zod";
import { parseDateOnly } from "@/lib/dates";
import { cleanPhone, normalizePhone } from "@/lib/phone";

/** Strip ASCII control characters (keeps newlines/tabs) and trim. */
export function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

const emptyToUndefined = (v: unknown) =>
  v === "" || v === null || (typeof v === "string" && v.trim() === "") ? undefined : v;

/** Required text field. */
export const zText = (max = 200, label = "This field") =>
  z
    .string({ error: `${label} is required` })
    .transform(cleanText)
    .pipe(z.string().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`));

/** Optional text field ("" → null). */
export const zOptText = (max = 1000) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .transform(cleanText)
      .pipe(z.string().max(max, `Must be at most ${max} characters`))
      .optional(),
  ).transform((v) => (v ? v : null));

export const zPhone = (required = true) => {
  const base = z
    .string()
    .transform(cleanPhone)
    .pipe(z.string().regex(/^\+?\d{9,15}$/, "Enter a valid phone number, e.g. 0712345678 or +254712345678"))
    .transform(normalizePhone);
  return required
    ? base
    : z.preprocess(emptyToUndefined, base.optional()).transform((v) => v ?? null);
};

export const zEmail = (required = true) => {
  const base = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(200));
  return required
    ? base
    : z.preprocess(emptyToUndefined, base.optional()).transform((v) => v ?? null);
};

/** Positive money amount with at most 2 decimals. */
export const zMoney = (opts: { allowZero?: boolean; max?: number; label?: string } = {}) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ error: `${opts.label ?? "Amount"} is required` })
      .refine((n) => Number.isFinite(n), "Enter a valid amount")
      .refine((n) => (opts.allowZero ? n >= 0 : n > 0), opts.allowZero ? "Cannot be negative" : "Must be greater than 0")
      .refine((n) => n <= (opts.max ?? 10_000_000), "Amount is too large")
      .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "At most 2 decimal places"),
  );

export const zOptMoney = () =>
  z.preprocess(emptyToUndefined, zMoney({ allowZero: true }).optional()).transform((v) => (v === undefined ? null : v));

/** Stock quantity (up to 3 decimals). */
export const zQuantity = (opts: { allowZero?: boolean; allowNegative?: boolean } = {}) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ error: "Quantity is required" })
      .refine((n) => Number.isFinite(n), "Enter a valid number")
      .refine(
        (n) => (opts.allowNegative ? n !== 0 : opts.allowZero ? n >= 0 : n > 0),
        opts.allowNegative ? "Cannot be zero" : opts.allowZero ? "Cannot be negative" : "Must be greater than 0",
      )
      .refine((n) => Math.abs(n) <= 1_000_000, "Quantity is too large"),
  );

export const zInt = (min: number, max: number, label = "Value") =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ error: `${label} is required` })
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be at least ${min}`)
      .max(max, `${label} must be at most ${max}`),
  );

/** "YYYY-MM-DD" → date-only Date (00:00 UTC). */
export const zDate = (label = "Date") =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .transform((s, ctx) => {
      try {
        return parseDateOnly(s);
      } catch {
        ctx.addIssue({ code: "custom", message: `${label} is not a valid date` });
        return z.NEVER;
      }
    });

export const zOptDate = (label = "Date") =>
  z.preprocess(emptyToUndefined, zDate(label).optional()).transform((v) => v ?? null);

/** Checkbox: "on" / "true" / true → true; missing → false. */
export const zCheckbox = () =>
  z.preprocess((v) => v === "on" || v === "true" || v === true || v === "1", z.boolean());

export const zId = () => z.string().trim().min(1, "Missing id").max(64);

export const zPassword = () =>
  z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long")
    .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), "Use letters and at least one number");
