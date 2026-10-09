import type { NotificationType } from "@prisma/client";
import {
  AlarmClock,
  AlertTriangle,
  Bell,
  BellOff,
  CalendarClock,
  CircleCheck,
  CircleX,
  ExternalLink,
  Megaphone,
  PackageX,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime, timeAgo } from "@/lib/dates";
import { cn, sp } from "@/lib/utils";
import { Card, EmptyState, FilterTabs, LinkButton, PageHeader, type Tone } from "@/components/ui/primitives";
import { MarkAllReadButton, MarkReadButton } from "./notification-buttons";

export const metadata = { title: "Notifications" };

const ICONS: Record<NotificationType, { icon: LucideIcon; tone: Tone }> = {
  RENT_DUE_SOON: { icon: CalendarClock, tone: "info" },
  RENT_DUE_TODAY: { icon: AlarmClock, tone: "warn" },
  RENT_OVERDUE: { icon: AlertTriangle, tone: "bad" },
  PAYMENT_RECEIVED: { icon: Wallet, tone: "good" },
  LOW_STOCK: { icon: AlertTriangle, tone: "warn" },
  OUT_OF_STOCK: { icon: PackageX, tone: "bad" },
  SHOPPING_REQUEST_NEW: { icon: ShoppingCart, tone: "info" },
  SHOPPING_REQUEST_APPROVED: { icon: CircleCheck, tone: "good" },
  SHOPPING_REQUEST_REJECTED: { icon: CircleX, tone: "bad" },
  ANNOUNCEMENT: { icon: Megaphone, tone: "accent" },
  GENERAL: { icon: Bell, tone: "neutral" },
};

const toneBg: Record<Tone, string> = {
  neutral: "bg-card-3 text-ink-2",
  accent: "bg-accent-lo text-accent-hi",
  good: "bg-good-lo text-good",
  warn: "bg-warn-lo text-warn",
  bad: "bg-bad-lo text-bad",
  info: "bg-info-lo text-info",
};

/** Only same-origin relative links are rendered. */
function safeLink(link: string | null): string | null {
  return link && link.startsWith("/") && !link.startsWith("//") ? link : null;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("notifications.view");
  const filter = sp(await searchParams, "filter") === "unread" ? "unread" : "all";

  const [items, unreadCount, totalCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id, ...(filter === "unread" ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.notification.count({ where: { userId: user.id } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={unreadCount ? `${unreadCount} unread` : "You're all caught up."}
        actions={<MarkAllReadButton disabled={unreadCount === 0} />}
      />
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <FilterTabs
            active={filter}
            tabs={[
              { value: "all", label: "All", href: "/notifications", count: totalCount },
              { value: "unread", label: "Unread", href: "/notifications?filter=unread", count: unreadCount },
            ]}
          />
          {items.length >= 100 && <span className="text-xs text-ink-3">Showing the latest 100</span>}
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={<BellOff className="h-5 w-5" />}
            title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
            description="Rent reminders, payments, stock alerts and announcements will appear here."
          />
        ) : (
          <ul className="-mx-2 divide-y divide-line/70">
            {items.map((n) => {
              const meta = ICONS[n.type] ?? ICONS.GENERAL;
              const Icon = meta.icon;
              const link = safeLink(n.link);
              const unread = !n.readAt;
              return (
                <li
                  key={n.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl px-2 py-3.5 @xl:flex-row @xl:items-start",
                    unread && "bg-accent-lo/40",
                  )}
                >
                  <div className="flex min-w-0 flex-1 gap-3">
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", toneBg[meta.tone])}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                        <p className={cn("text-sm", unread ? "font-semibold text-ink" : "font-medium text-ink-2")}>{n.title}</p>
                        <time className="text-xs text-ink-3" dateTime={n.createdAt.toISOString()} title={formatDateTime(n.createdAt)}>
                          {timeAgo(n.createdAt)}
                        </time>
                      </div>
                      <p className="mt-0.5 whitespace-pre-line wrap-break-word text-[13px] text-ink-2">{n.message}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 pl-12 @xl:pl-0">
                    {link && (
                      <LinkButton href={link} size="sm" variant="outline">
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </LinkButton>
                    )}
                    {unread && <MarkReadButton id={n.id} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
