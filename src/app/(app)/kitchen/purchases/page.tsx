import { Plus, Receipt, Trash2 } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDate, toISODate, todayISO } from "@/lib/dates";
import { formatMoney, formatNumber, round2, toNumber } from "@/lib/format";
import { cn, sp } from "@/lib/utils";
import { ConfirmAction, Dialog } from "@/components/ui/dialog";
import { Badge, Card, EmptyState, PageHeader, StatCard, Table, TD, TH, THead } from "@/components/ui/primitives";
import { KitchenTabs } from "../kitchen-tabs";
import { FilterBar, FilterField, filterControlClass } from "../filter-bar";
import { parseRange } from "../server-utils";
import { voidPurchaseAction } from "./actions";
import { PurchaseForm, type PurchaseRequestOption } from "./purchase-form";

export const metadata = { title: "Purchases" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PurchasesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission("purchases.view");
  const params = await searchParams;
  const { from, to } = parseRange(sp(params, "from"), sp(params, "to"));
  const itemFilter = sp(params, "item") || undefined;
  const requestParam = sp(params, "request") || undefined;
  const canRecord = can(user.role, "purchases.record");
  const canVoid = can(user.role, "purchases.void");

  const where: Prisma.PurchaseWhereInput = {
    purchaseDate: { gte: from, lte: to },
    ...(itemFilter ? { itemId: itemFilter } : {}),
  };

  const [purchases, allItems, approved] = await Promise.all([
    db.purchase.findMany({
      where,
      orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
      take: 500,
      include: { item: { select: { name: true } }, recordedBy: { select: { name: true } }, shoppingRequest: { select: { id: true } } },
    }),
    db.inventoryItem.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, supplier: true, isActive: true },
    }),
    canRecord
      ? db.shoppingRequest.findMany({
          where: { status: "APPROVED" },
          orderBy: { createdAt: "desc" },
          include: { items: true, requestedBy: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const activeItems = allItems.filter((i) => i.isActive).map(({ id, name, unit, supplier }) => ({ id, name, unit, supplier }));
  const requestOptions: PurchaseRequestOption[] = approved.map((r) => ({
    id: r.id,
    label: `${r.items.map((i) => i.name).join(", ").slice(0, 60)} — ${r.requestedBy?.name ?? "Unknown"}, ${formatDate(r.createdAt)}`,
    lines: r.items
      .filter((i) => i.inventoryItemId)
      .map((i) => {
        const qty = toNumber(i.quantity);
        return {
          inventoryItemId: i.inventoryItemId!,
          quantity: qty,
          unitCost: i.estimatedCost !== null && qty > 0 ? round2(toNumber(i.estimatedCost) / qty) : null,
        };
      }),
  }));
  const linkedRequest = requestParam ? approved.find((r) => r.id === requestParam) : undefined;

  const live = purchases.filter((p) => !p.voidedAt);
  const total = round2(live.reduce((a, p) => a + toNumber(p.totalCost), 0));
  const voidedCount = purchases.length - live.length;
  const fromISO = toISODate(from);
  const toISO = toISODate(to);
  const tISO = todayISO();

  const formProps = { items: activeItems, requests: requestOptions, todayISO: tISO };

  return (
    <div>
      <KitchenTabs role={user.role} />
      <PageHeader
        title="Purchases"
        description="Food and supplies bought for the kitchen. Recording a purchase adds it to stock."
        actions={
          canRecord ? (
            <Dialog trigger={<><Plus className="h-4 w-4" /> Record purchase</>} triggerVariant="primary" title="Record purchase" wide>
              <PurchaseForm {...formProps} />
            </Dialog>
          ) : undefined
        }
      />

      {canRecord && requestParam && (
        <Card
          className="mb-5 border-accent/40"
          title="Record purchases for a shopping request"
          subtitle={
            linkedRequest
              ? `Requested by ${linkedRequest.requestedBy?.name ?? "Unknown"}: ${linkedRequest.items
                  .map((i) => `${formatNumber(i.quantity, 3)} ${i.unit} ${i.name}`)
                  .join(", ")}`
              : "This request is not approved (or no longer exists), so purchases cannot be linked to it."
          }
        >
          {linkedRequest && (
            <div className="max-w-3xl">
              <PurchaseForm {...formProps} initialRequestId={linkedRequest.id} />
            </div>
          )}
        </Card>
      )}

      <div className="mb-5 grid grid-cols-1 gap-3 @xl:grid-cols-3">
        <StatCard label="Total spent" value={formatMoney(total)} hint={`${formatDate(from)} – ${formatDate(to)}`} tone="accent" icon={<Receipt className="h-4 w-4" />} />
        <StatCard label="Purchases" value={live.length} hint={voidedCount ? `${voidedCount} voided (excluded)` : "In this period"} />
        <StatCard label="Average purchase" value={live.length ? formatMoney(round2(total / live.length)) : "—"} />
      </div>

      <Card>
        <FilterBar resetHref="/kitchen/purchases">
          <FilterField label="From">
            <input type="date" name="from" defaultValue={fromISO} max={tISO} className={filterControlClass} />
          </FilterField>
          <FilterField label="To">
            <input type="date" name="to" defaultValue={toISO} max={tISO} className={filterControlClass} />
          </FilterField>
          <FilterField label="Item">
            <select name="item" defaultValue={itemFilter ?? ""} className={filterControlClass}>
              <option value="">All items</option>
              {allItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </FilterField>
        </FilterBar>

        {purchases.length === 0 ? (
          <EmptyState icon={<Receipt className="h-5 w-5" />} title="No purchases in this period" description="Change the dates or record a new purchase." />
        ) : (
          <Table className="[&_table]:min-w-225">
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Item</TH>
                <TH align="right">Quantity</TH>
                <TH align="right">Unit cost</TH>
                <TH align="right">Total</TH>
                <TH>Supplier</TH>
                <TH>Reference</TH>
                <TH>Recorded by</TH>
                {canVoid && (
                  <TH align="right">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </tr>
            </THead>
            <tbody>
              {purchases.map((p) => {
                const voided = !!p.voidedAt;
                const strike = voided ? "line-through text-ink-3" : undefined;
                return (
                  <tr key={p.id}>
                    <TD className="whitespace-nowrap">
                      <span className={strike}>{formatDate(p.purchaseDate)}</span>
                    </TD>
                    <TD>
                      <span className={cn("font-medium", strike)}>{p.item.name}</span>
                      {voided && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                          <Badge tone="bad">Voided</Badge>
                          {p.voidReason}
                        </div>
                      )}
                      {p.shoppingRequest && !voided && <div className="mt-0.5 text-xs text-ink-3">From shopping request</div>}
                    </TD>
                    <TD align="right" className={cn("whitespace-nowrap", strike)}>
                      {formatNumber(p.quantity, 3)} {p.unit}
                    </TD>
                    <TD align="right" className={cn("whitespace-nowrap", strike)}>{formatMoney(p.unitCost)}</TD>
                    <TD align="right" className={cn("whitespace-nowrap font-medium", strike)}>{formatMoney(p.totalCost)}</TD>
                    <TD className="text-ink-2">{p.supplier ?? "—"}</TD>
                    <TD className="text-ink-2">{p.reference ?? "—"}</TD>
                    <TD className="whitespace-nowrap text-ink-2">{p.recordedBy?.name ?? "—"}</TD>
                    {canVoid && (
                      <TD align="right">
                        {!voided && (
                          <ConfirmAction
                            action={voidPurchaseAction}
                            payload={{ id: p.id }}
                            label={<Trash2 className="h-4 w-4" />}
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Void this purchase?"
                            message={`${formatNumber(p.quantity, 3)} ${p.unit} of ${p.item.name} (${formatMoney(p.totalCost)}) will be removed from stock and excluded from totals. This fails if the stock was already used.`}
                            requireReason="Reason for voiding"
                            confirmLabel="Void purchase"
                            confirmVariant="danger"
                          />
                        )}
                      </TD>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="pt-3 text-xs font-medium uppercase tracking-wide text-ink-3">
                  Total ({live.length} purchase{live.length === 1 ? "" : "s"})
                </td>
                <td className="tabular px-3 pt-3 text-right font-semibold text-ink">{formatMoney(total)}</td>
                <td colSpan={canVoid ? 4 : 3} />
              </tr>
            </tfoot>
          </Table>
        )}
      </Card>
    </div>
  );
}
