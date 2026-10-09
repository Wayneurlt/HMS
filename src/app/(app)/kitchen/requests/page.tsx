import { Check, ClipboardList, Plus, Receipt, ShoppingBag, X } from "lucide-react";
import type { ShoppingRequestStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatDateTime, today, todayISO } from "@/lib/dates";
import { formatMoney, formatNumber, round2, toNumber } from "@/lib/format";
import { sp } from "@/lib/utils";
import { ConfirmAction, Dialog } from "@/components/ui/dialog";
import { Card, EmptyState, FilterTabs, LinkButton, PageHeader } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { KitchenTabs } from "../kitchen-tabs";
import { SHOPPING_STATUSES } from "../constants";
import { cancelShoppingRequest } from "./actions";
import { MarkPurchasedForm, ReviewRequestForm, ShoppingRequestForm, type RequestStockOption } from "./request-forms";

export const metadata = { title: "Shopping requests" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TAB_LABELS: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  PURCHASED: "Purchased",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export default async function ShoppingRequestsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission("shopping.view");
  const params = await searchParams;
  const statusParam = (sp(params, "status") ?? "PENDING").toUpperCase();
  const status = statusParam === "ALL" ? "ALL" : SHOPPING_STATUSES.includes(statusParam as never) ? (statusParam as ShoppingRequestStatus) : "PENDING";
  const prefillItem = sp(params, "item");
  const showInline = !!prefillItem || sp(params, "new") === "1";

  const canCreate = can(user.role, "shopping.create");
  const canReview = can(user.role, "shopping.review");
  const canRecord = can(user.role, "purchases.record");
  const canSeeCosts = can(user.role, "purchases.view");

  const [requests, grouped, stockRaw] = await Promise.all([
    db.shoppingRequest.findMany({
      where: status === "ALL" ? {} : { status },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        items: { include: { inventoryItem: { select: { isActive: true, deletedAt: true } } } },
        requestedBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
        _count: { select: { purchases: { where: { voidedAt: null } } } },
      },
    }),
    db.shoppingRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    canCreate
      ? db.inventoryItem.findMany({
          where: { deletedAt: null, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, unit: true, currentQuantity: true, minQuantity: true, maxQuantity: true },
        })
      : Promise.resolve([]),
  ]);

  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as Record<string, number>;
  const all = Object.values(counts).reduce((a, n) => a + n, 0);
  const stock: RequestStockOption[] = stockRaw.map((s) => {
    const qty = toNumber(s.currentQuantity);
    const target = s.maxQuantity !== null ? toNumber(s.maxQuantity) : toNumber(s.minQuantity) * 2;
    const suggested = Math.max(0, Math.ceil(target - qty));
    return { id: s.id, name: s.name, unit: s.unit, suggested };
  });
  const tISO = todayISO();
  const t = today().getTime();

  return (
    <div>
      <KitchenTabs role={user.role} />
      <PageHeader
        title="Shopping requests"
        description={canReview ? "Requests from the kitchen waiting for approval, and their history." : "Ask for items to be bought. The owner or manager approves requests."}
        actions={
          canCreate && !showInline ? (
            <Dialog trigger={<><Plus className="h-4 w-4" /> New request</>} triggerVariant="primary" title="New shopping request" wide>
              <ShoppingRequestForm stock={stock} todayISO={tISO} />
            </Dialog>
          ) : undefined
        }
      />

      {canCreate && showInline && (
        <Card className="mb-5 border-accent/40" title="New shopping request" subtitle="Approvers are notified as soon as you send it." action={<LinkButton href="/kitchen/requests" variant="ghost" size="sm">Close</LinkButton>}>
          <div className="max-w-5xl">
            <ShoppingRequestForm stock={stock} todayISO={tISO} initialItemId={prefillItem} />
          </div>
        </Card>
      )}

      <div className="mb-4">
        <FilterTabs
          active={status}
          tabs={[
            ...SHOPPING_STATUSES.map((s) => ({ label: TAB_LABELS[s]!, value: s, href: `/kitchen/requests?status=${s.toLowerCase()}`, count: counts[s] ?? 0 })),
            { label: "All", value: "ALL", href: "/kitchen/requests?status=all", count: all },
          ]}
        />
      </div>

      {requests.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" />}
            title={status === "PENDING" ? "No requests waiting for approval" : "No requests here"}
            description={canCreate ? "Raise a request when stock runs low or something new is needed." : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-4 @4xl:grid-cols-2 @[100rem]:grid-cols-3">
          {requests.map((r) => {
            const est = r.items.reduce((a, i) => a + toNumber(i.estimatedCost), 0);
            const hasEst = r.items.some((i) => i.estimatedCost !== null);
            const overdue = r.neededBy && r.neededBy.getTime() < t && (r.status === "PENDING" || r.status === "APPROVED");
            const isOwnerOrRequester = r.requestedById === user.id || user.role === "OWNER";
            const purchasable = r.items
              .filter((i) => i.inventoryItemId && i.inventoryItem && !i.inventoryItem.deletedAt && i.inventoryItem.isActive)
              .map((i) => {
                const qty = toNumber(i.quantity);
                return {
                  inventoryItemId: i.inventoryItemId!,
                  name: i.name,
                  unit: i.unit,
                  quantity: qty,
                  unitCost: i.estimatedCost !== null && qty > 0 ? round2(toNumber(i.estimatedCost) / qty) : null,
                };
              });
            const otherItems = r.items.filter((i) => !purchasable.some((p) => p.inventoryItemId === i.inventoryItemId)).map((i) => i.name);
            return (
              <Card key={r.id} bodyClassName="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{r.requestedBy?.name ?? "Unknown"}</p>
                    <p className="text-xs text-ink-3">{formatDateTime(r.createdAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge kind="priority" value={r.priority} />
                    <StatusBadge kind="shopping" value={r.status} />
                  </div>
                </div>

                <ul className="divide-y divide-line/70 rounded-xl border border-line">
                  {r.items.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate text-ink">{i.name}</span>
                      <span className="flex shrink-0 items-center gap-3 tabular">
                        <span className="text-ink">
                          {formatNumber(i.quantity, 3)} <span className="text-xs text-ink-3">{i.unit}</span>
                        </span>
                        {i.estimatedCost !== null && <span className="w-24 text-right text-xs text-ink-3">{formatMoney(i.estimatedCost)}</span>}
                      </span>
                    </li>
                  ))}
                  {hasEst && (
                    <li className="flex justify-between px-3 py-2 text-xs text-ink-2">
                      <span>Estimated total</span>
                      <span className="font-medium tabular text-ink">{formatMoney(est)}</span>
                    </li>
                  )}
                </ul>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-ink-3">Needed by</div>
                    <div className={overdue ? "font-medium text-bad" : "text-ink"}>{r.neededBy ? formatDate(r.neededBy) : "—"}</div>
                  </div>
                  {r._count.purchases > 0 && (
                    <div>
                      <div className="text-ink-3">Purchases linked</div>
                      <div className="text-ink">{r._count.purchases}</div>
                    </div>
                  )}
                  {r.reason && (
                    <div className="col-span-2">
                      <div className="text-ink-3">Reason</div>
                      <div className="text-ink-2">{r.reason}</div>
                    </div>
                  )}
                </div>

                {r.reviewedAt && (
                  <div className="rounded-xl bg-card-2 px-3 py-2 text-xs">
                    <span className="text-ink-3">
                      {r.status === "REJECTED" ? "Rejected" : "Approved"} by {r.reviewedBy?.name ?? "—"} · {formatDateTime(r.reviewedAt)}
                    </span>
                    {r.reviewNote && <p className="mt-1 text-sm text-ink-2">{r.reviewNote}</p>}
                  </div>
                )}

                {(r.status === "PENDING" || r.status === "APPROVED") && (
                  <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                    {r.status === "PENDING" && canReview && (
                      <>
                        <Dialog trigger={<><Check className="h-4 w-4" /> Approve</>} triggerVariant="primary" triggerSize="sm" title="Approve shopping request">
                          <ReviewRequestForm id={r.id} decision="APPROVE" />
                        </Dialog>
                        <Dialog trigger={<><X className="h-4 w-4" /> Reject</>} triggerVariant="danger" triggerSize="sm" title="Reject shopping request">
                          <ReviewRequestForm id={r.id} decision="REJECT" />
                        </Dialog>
                      </>
                    )}
                    {r.status === "APPROVED" && (canCreate || canReview) && (
                      <Dialog trigger={<><ShoppingBag className="h-4 w-4" /> Mark purchased</>} triggerVariant="primary" triggerSize="sm" title="Mark as purchased" wide>
                        <MarkPurchasedForm id={r.id} lines={purchasable} otherItems={otherItems} canRecord={canRecord} todayISO={tISO} />
                      </Dialog>
                    )}
                    {r.status === "APPROVED" && canRecord && canSeeCosts && (
                      <LinkButton href={`/kitchen/purchases?request=${r.id}`} size="sm">
                        <Receipt className="h-4 w-4" /> Record purchases
                      </LinkButton>
                    )}
                    {isOwnerOrRequester && (
                      <ConfirmAction
                        action={cancelShoppingRequest}
                        payload={{ id: r.id }}
                        label="Cancel request"
                        variant="ghost"
                        title="Cancel this request?"
                        message="It will be marked as cancelled and kept in the history."
                        confirmLabel="Cancel request"
                        confirmVariant="danger"
                      />
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
