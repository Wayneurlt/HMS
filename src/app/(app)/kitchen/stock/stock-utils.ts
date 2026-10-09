/** Fill percentage for the stock level bar: against max, else twice the minimum. */
export function levelPercent(quantity: number, min: number, max: number | null): number {
  if (max && max > 0) return (quantity / max) * 100;
  if (min > 0) return (quantity / (min * 2)) * 100;
  return quantity > 0 ? 100 : 0;
}

export const levelTone = (status: string): "good" | "warn" | "bad" =>
  status === "OUT_OF_STOCK" ? "bad" : status === "LOW_STOCK" ? "warn" : "good";
