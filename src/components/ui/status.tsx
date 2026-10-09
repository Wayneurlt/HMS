import { Badge, type Tone } from "./primitives";
import { label } from "@/lib/format";

/** Consistent badge colours for every enum shown in the UI. */
const TONES: Record<string, Record<string, Tone>> = {
  rent: { PAID: "good", PARTIALLY_PAID: "warn", PENDING: "neutral", OVERDUE: "bad" },
  student: { ACTIVE: "good", PENDING: "warn", SUSPENDED: "bad", CHECKED_OUT: "neutral" },
  bed: { AVAILABLE: "good", OCCUPIED: "accent", RESERVED: "warn", MAINTENANCE: "bad" },
  stock: { IN_STOCK: "good", LOW_STOCK: "warn", OUT_OF_STOCK: "bad" },
  shopping: { PENDING: "warn", APPROVED: "info", REJECTED: "bad", PURCHASED: "good", CANCELLED: "neutral" },
  priority: { LOW: "neutral", NORMAL: "info", HIGH: "warn", URGENT: "bad" },
  overnight: { STAYING: "good", AWAY: "warn", NOT_RESPONDED: "neutral" },
  reminder: { SENT: "good", PENDING: "neutral", FAILED: "bad", SKIPPED: "warn" },
  role: { OWNER: "accent", HOSTEL_MANAGER: "info", KITCHEN_STAFF: "warn", STUDENT: "neutral" },
  active: { true: "good", false: "neutral" },
};

const OVERRIDE_LABELS: Record<string, string> = {
  IN_STOCK: "In stock",
  LOW_STOCK: "Low stock",
  OUT_OF_STOCK: "Out of stock",
  NOT_RESPONDED: "Not responded",
};

export function StatusBadge({ kind, value, className }: { kind: keyof typeof TONES; value: string | boolean; className?: string }) {
  const key = String(value);
  const text = kind === "active" ? (value ? "Active" : "Inactive") : (OVERRIDE_LABELS[key] ?? label(key));
  return (
    <Badge tone={TONES[kind]?.[key] ?? "neutral"} dot className={className}>
      {text}
    </Badge>
  );
}
