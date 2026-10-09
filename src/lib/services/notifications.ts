import "server-only";
import type { NotificationType, Role } from "@prisma/client";
import { db, type Tx } from "@/lib/db";

type NotifyInput = {
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  /** Same key for the same user is only stored once (skipDuplicates). */
  dedupeKey?: string | null;
};

/** Notify specific users. */
export async function notifyUsers(client: Tx | typeof db, userIds: string[], n: NotifyInput): Promise<number> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return 0;
  const res = await client.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      type: n.type,
      title: n.title.slice(0, 200),
      message: n.message.slice(0, 2000),
      link: n.link ?? null,
      dedupeKey: n.dedupeKey ?? null,
    })),
    skipDuplicates: true,
  });
  return res.count;
}

/** Notify every active user with one of the given roles. */
export async function notifyRoles(client: Tx | typeof db, roles: Role[], n: NotifyInput): Promise<number> {
  const users = await client.user.findMany({
    where: { role: { in: roles }, isActive: true },
    select: { id: true },
  });
  return notifyUsers(
    client,
    users.map((u) => u.id),
    n,
  );
}
