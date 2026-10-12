import { APP_NAME } from "@/lib/brand";
import "server-only";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { getSettings } from "./settings";

/** Public facts about the hostel for the sign-in screen. No resident or financial data. */
export type PublicInfo = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  rent: number;
  breakfastTime: string;
  dinnerTime: string;
  totalBeds: number;
  availableBeds: number;
  needsSetup: boolean;
};

export async function getPublicInfo(): Promise<PublicInfo | null> {
  try {
    const [settings, beds, owners] = await Promise.all([
      getSettings(),
      db.bed.groupBy({
        by: ["status"],
        where: { deletedAt: null, room: { deletedAt: null, isActive: true } },
        _count: { _all: true },
      }),
      db.user.count({ where: { role: "OWNER" } }),
    ]);
    return {
      name: APP_NAME,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      rent: toNumber(settings.defaultMonthlyRent),
      breakfastTime: settings.breakfastTime,
      dinnerTime: settings.dinnerTime,
      totalBeds: beds.reduce((a, b) => a + b._count._all, 0),
      availableBeds: beds.find((b) => b.status === "AVAILABLE")?._count._all ?? 0,
      needsSetup: owners === 0,
    };
  } catch (e) {
    console.error("[public-info] could not load hostel info", e);
    return null;
  }
}
