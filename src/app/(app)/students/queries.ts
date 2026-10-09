import "server-only";
import { db } from "@/lib/db";

export type BedOption = { value: string; label: string };

/** Beds that can take a new occupant: AVAILABLE/RESERVED, no active stay, in an active room. */
export async function availableBedOptions(): Promise<BedOption[]> {
  const beds = await db.bed.findMany({
    where: {
      deletedAt: null,
      status: { in: ["AVAILABLE", "RESERVED"] },
      activeAccommodation: { is: null },
      room: { deletedAt: null, isActive: true },
    },
    include: { room: { select: { name: true } } },
  });
  const collator = new Intl.Collator("en", { numeric: true });
  beds.sort((a, b) => collator.compare(a.room.name, b.room.name) || collator.compare(a.label, b.label));
  return beds.map((b) => ({
    value: b.id,
    label: `${b.room.name} · ${b.label}${b.status === "RESERVED" ? " (reserved)" : ""}`,
  }));
}
