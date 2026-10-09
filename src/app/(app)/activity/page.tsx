import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight, Filter, History } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { HOSTEL_TZ, addDays, formatDateTime, parseDateOnly, toISODate } from "@/lib/dates";
import { humanize } from "@/lib/format";
import { cn, sp } from "@/lib/utils";
import { ACTIONS } from "@/lib/services/activity";
import { Input, Select } from "@/components/ui/form";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, TD, TH, THead } from "@/components/ui/primitives";

export const metadata = { title: "Activity log" };

const PAGE_SIZE = 50;
const FINANCIAL_PREFIXES = ["payment.", "rent.", "expense.", "purchase."];
const ALL_ACTIONS = Object.values(ACTIONS) as string[];
const PREFIXES = [...new Set(ALL_ACTIONS.map((a) => a.split(".")[0]! + "."))];

function humanizeAction(a: string): string {
  return a
    .split(".")
    .map((p, i) => (i === 0 ? humanize(p) : humanize(p).toLowerCase()))
    .join(" ");
}

function safeDate(v: string | undefined): Date | null {
  if (!v) return null;
  try {
    return parseDateOnly(v);
  } catch {
    return null;
  }
}

/** The instant at which the hostel-local calendar day `d` starts. */
function localDayStart(d: Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HOSTEL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(d.getTime() - (wall - d.getTime()));
}

function entityHref(type: string, id: string | null): string | null {
  if (!id) return null;
  if (type === "Student") return `/students/${id}`;
  if (type === "RentInvoice") return `/rent/${id}`;
  if (type === "Announcement") return "/announcements";
  if (type === "User") return "/users";
  if (type === "HostelSettings") return "/settings";
  return null;
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(renderValue).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("from" in o && "to" in o && Object.keys(o).length === 2) return `${renderValue(o.from)} → ${renderValue(o.to)}`;
    return Object.entries(o)
      .map(([k, x]) => `${humanize(k)}: ${renderValue(x)}`)
      .join("; ");
  }
  return String(v);
}

function Details({ details }: { details: Prisma.JsonValue | null }) {
  if (details === null || details === undefined) return <span className="text-ink-3">—</span>;
  const entries: [string, unknown][] =
    typeof details === "object" && !Array.isArray(details) ? Object.entries(details) : [["value", details]];
  if (entries.length === 0) return <span className="text-ink-3">—</span>;
  const line = (k: string, v: unknown) => (
    <div key={k} className="wrap-break-word">
      <span className="text-ink-3">{humanize(k)}:</span> <span className="text-ink-2">{renderValue(v)}</span>
    </div>
  );
  const preview = entries.slice(0, 2);
  if (entries.length <= 2 && preview.every(([, v]) => renderValue(v).length <= 80)) {
    return <div className="space-y-0.5 text-xs">{preview.map(([k, v]) => line(k, v))}</div>;
  }
  return (
    <details className="group text-xs">
      <summary className="cursor-pointer list-none text-ink-2 marker:hidden">
        <span className="line-clamp-1">
          {preview.map(([k, v]) => `${humanize(k)}: ${renderValue(v)}`).join(" · ")}
        </span>
        <span className="text-accent-hi group-open:hidden">Show all ({entries.length})</span>
      </summary>
      <div className="mt-1.5 space-y-0.5 rounded-lg bg-card-2 p-2.5">{entries.map(([k, v]) => line(k, v))}</div>
    </details>
  );
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("activity.view");
  const params = await searchParams;

  const entityType = sp(params, "entity")?.slice(0, 60) || "";
  const actionParam = sp(params, "action") || "";
  const action = PREFIXES.includes(actionParam) || ALL_ACTIONS.includes(actionParam) ? actionParam : "";
  const userId = sp(params, "user")?.slice(0, 64) || "";
  let from = safeDate(sp(params, "from"));
  let to = safeDate(sp(params, "to"));
  if (from && to && from.getTime() > to.getTime()) [from, to] = [to, from];
  const pageNum = Math.max(1, Math.min(10_000, Number.parseInt(sp(params, "page") ?? "1", 10) || 1));

  const where: Prisma.ActivityLogWhereInput = {
    ...(entityType ? { entityType } : {}),
    ...(action ? (action.endsWith(".") ? { action: { startsWith: action } } : { action }) : {}),
    ...(userId ? { userId: userId === "system" ? null : userId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: localDayStart(from) } : {}),
            ...(to ? { lt: localDayStart(addDays(to, 1)) } : {}),
          },
        }
      : {}),
  };

  const [total, logs, entityTypes, users] = await Promise.all([
    db.activityLog.count({ where }),
    db.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true, role: true } } },
    }),
    db.activityLog.groupBy({ by: ["entityType"], orderBy: { entityType: "asc" } }),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const query = (page: number) => {
    const p = new URLSearchParams();
    if (entityType) p.set("entity", entityType);
    if (action) p.set("action", action);
    if (userId) p.set("user", userId);
    if (from) p.set("from", toISODate(from));
    if (to) p.set("to", toISODate(to));
    if (page > 1) p.set("page", String(page));
    const s = p.toString();
    return s ? `/activity?${s}` : "/activity";
  };
  const filtered = Boolean(entityType || action || userId || from || to);

  const actionOptions = PREFIXES.flatMap((prefix) => [
    { value: prefix, label: `${humanize(prefix.slice(0, -1))} — all` },
    ...ALL_ACTIONS.filter((a) => a.startsWith(prefix)).map((a) => ({ value: a, label: `   ${humanizeAction(a)}` })),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title="Activity log" description="Audit trail of sign-ins and every important change. Entries cannot be edited." />

      <Card className="no-print">
        <form method="get" action="/activity" className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-6 @4xl:items-end">
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-ink-2">Entity</span>
            <Select name="entity" defaultValue={entityType} placeholder="All entities" options={entityTypes.map((e) => ({ value: e.entityType, label: e.entityType }))} />
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-ink-2">Action</span>
            <Select name="action" defaultValue={action} placeholder="All actions" options={actionOptions} />
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-ink-2">User</span>
            <Select
              name="user"
              defaultValue={userId}
              placeholder="Everyone"
              options={[{ value: "system", label: "System (automatic)" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-ink-2">From</span>
            <Input name="from" type="date" defaultValue={from ? toISODate(from) : ""} />
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-ink-2">To</span>
            <Input name="to" type="date" defaultValue={to ? toISODate(to) : ""} />
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hi">
              <Filter className="h-4 w-4" /> Filter
            </button>
            {filtered && (
              <Link href="/activity" className="inline-flex h-10 items-center px-2 text-sm text-ink-2 hover:text-ink">
                Clear
              </Link>
            )}
          </div>
        </form>
      </Card>

      <Card title="Entries" subtitle={`${total.toLocaleString("en-KE")} entr${total === 1 ? "y" : "ies"}${filtered ? " matching filters" : ""}`}>
        {logs.length === 0 ? (
          <EmptyState icon={<History className="h-5 w-5" />} title="No activity found" description={filtered ? "Try widening the filters." : "Actions will be recorded here."} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Time</TH>
                <TH>User</TH>
                <TH>Action</TH>
                <TH>Entity</TH>
                <TH className="min-w-64">Details</TH>
              </tr>
            </THead>
            <tbody>
              {logs.map((l) => {
                const financial = FINANCIAL_PREFIXES.some((p) => l.action.startsWith(p));
                const href = entityHref(l.entityType, l.entityId);
                return (
                  <tr key={l.id} className={cn(financial && "bg-warn-lo/30")}>
                    <TD className="whitespace-nowrap align-top text-xs text-ink-2">{formatDateTime(l.createdAt)}</TD>
                    <TD className="align-top">
                      {l.user ? (
                        <div className="text-[13px]">
                          {l.user.name}
                          <div className="text-[11px] text-ink-3">{humanize(l.user.role)}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-3">System</span>
                      )}
                    </TD>
                    <TD className="align-top">
                      <Badge tone={financial ? "warn" : l.action.startsWith("auth.login_failed") ? "bad" : "neutral"}>{humanizeAction(l.action)}</Badge>
                    </TD>
                    <TD className="align-top text-xs">
                      <div className="text-ink-2">{l.entityType}</div>
                      {l.entityId &&
                        (href ? (
                          <Link href={href} className="font-mono text-[11px] text-accent-hi hover:underline">
                            {l.entityId.slice(0, 12)}
                          </Link>
                        ) : (
                          <span className="font-mono text-[11px] text-ink-3" title={l.entityId}>
                            {l.entityId.slice(0, 12)}
                          </span>
                        ))}
                    </TD>
                    <TD className="max-w-md align-top">
                      <Details details={l.details} />
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {pages > 1 && (
          <div className="no-print mt-4 flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-3">
              Page {Math.min(pageNum, pages)} of {pages}
            </span>
            <div className="flex gap-2">
              {pageNum > 1 ? (
                <LinkButton href={query(pageNum - 1)} size="sm">
                  <ChevronLeft className="h-3.5 w-3.5" /> Newer
                </LinkButton>
              ) : null}
              {pageNum < pages ? (
                <LinkButton href={query(pageNum + 1)} size="sm">
                  Older <ChevronRight className="h-3.5 w-3.5" />
                </LinkButton>
              ) : null}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
