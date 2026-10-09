import type { ReactNode } from "react";
import { Megaphone } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/status";
import { cn } from "@/lib/utils";

export function AnnouncementCard({
  a,
  actions,
}: {
  a: {
    title: string;
    message: string;
    priority: string;
    audience: string;
    publishAt: Date;
    expiresAt: Date | null;
    createdBy?: { name: string } | null;
  };
  actions?: ReactNode;
}) {
  const urgent = a.priority === "URGENT" || a.priority === "HIGH";
  return (
    <article className={cn("rounded-2xl border bg-card-2/50 p-4", urgent ? "border-warn/30" : "border-line")}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full", urgent ? "bg-warn-lo text-warn" : "bg-accent-lo text-accent-hi")}>
          <Megaphone className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{a.title}</h3>
            <StatusBadge kind="priority" value={a.priority} />
          </div>
          <p className="mt-1.5 whitespace-pre-line wrap-break-word text-sm text-ink-2">{a.message}</p>
          <p className="mt-2 text-xs text-ink-3">
            {formatDateTime(a.publishAt)}
            {a.createdBy?.name ? ` · ${a.createdBy.name}` : ""}
            {a.expiresAt ? ` · until ${formatDate(new Date(a.expiresAt.getTime() - 86_400_000))}` : ""}
          </p>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
    </article>
  );
}
