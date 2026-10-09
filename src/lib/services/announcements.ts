import "server-only";
import type { AnnouncementAudience, Role } from "@prisma/client";
import { db } from "@/lib/db";

export function audiencesFor(role: Role): AnnouncementAudience[] {
  return role === "STUDENT" ? ["ALL", "STUDENTS"] : ["ALL", "STAFF", "STUDENTS"];
}

/** Announcements currently visible to a role (published, not expired, not deleted). */
export async function activeAnnouncements(role: Role, take = 50) {
  const now = new Date();
  return db.announcement.findMany({
    where: {
      deletedAt: null,
      publishAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      audience: { in: audiencesFor(role) },
    },
    orderBy: [{ publishAt: "desc" }],
    take,
    include: { createdBy: { select: { name: true } } },
  });
}
