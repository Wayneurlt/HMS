/**
 * Phone number normalisation (client-safe).
 *
 * Kenyan numbers are stored in one canonical form, +2547XXXXXXXX / +2541XXXXXXXX, so the
 * same number typed as 0712 345 678, 254712345678 or +254712345678 always matches.
 * Other international numbers are kept as typed (without spaces/dashes/brackets).
 */
export function cleanPhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}

export function normalizePhone(raw: string): string {
  const p = cleanPhone(raw);
  if (/^0[17]\d{8}$/.test(p)) return `+254${p.slice(1)}`;
  if (/^254[17]\d{8}$/.test(p)) return `+${p}`;
  if (/^[17]\d{8}$/.test(p)) return `+254${p}`;
  return p;
}

/** Every stored form a typed number might match (canonical first, then legacy local form). */
export function phoneVariants(raw: string): string[] {
  const canonical = normalizePhone(raw);
  const variants = new Set([canonical, cleanPhone(raw)]);
  const m = /^\+254([17]\d{8})$/.exec(canonical);
  if (m) {
    variants.add(`0${m[1]}`);
    variants.add(`254${m[1]}`);
  }
  return [...variants];
}
