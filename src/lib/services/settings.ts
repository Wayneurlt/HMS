import "server-only";
import type { HostelSettings } from "@prisma/client";
import { db, type Tx } from "@/lib/db";

/** The singleton settings row (created with defaults on first access). */
export async function getSettings(client: Tx | typeof db = db): Promise<HostelSettings> {
  const existing = await client.hostelSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return client.hostelSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}
