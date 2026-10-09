import { notFound } from "next/navigation";
import { ArrowLeft, History, Pencil, Power, Receipt, ShoppingCart, SlidersHorizontal, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { stockStatus } from "@/lib/services/inventory";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney, formatNumber, label, toNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConfirmAction, Dialog } from "@/components/ui/dialog";
import { Badge, Card, DetailList, EmptyState, LinkButton, PageHeader, ProgressBar, Table, TD, TH, THead } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { KitchenTabs } from "../../kitchen-tabs";
import { removeStockItem, setStockItemActive } from "../actions";
import { AdjustStockForm, StockItemForm } from "../stock-forms";
import { levelPercent, levelTone } from "../stock-utils";

export const metadata = { title: "Stock item" };

const TYPE_TONE = { OPENING: "info", PURCHASE: "good", CONSUMPTION: "neutral", WASTE: "bad", ADJUSTMENT: "warn" } as const;

export default async function StockItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("stock.view");
  const { id } = await params;
  const canPurchases = can(user.role, "purchases.view");
  const canManage = can(user.role, "stock.manage");
  const canRequest = can(user.role, "shopping.create");

  const item = await db.inventoryItem.findUnique({ where: { id } });
  if (!item || item.deletedAt) notFound();

  const [moves, purchases] = await Promise.all([
    db.inventoryTransaction.findMany({
      where: { itemId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { createdBy: { select: { name: true } } },
    }),
    canPurchases
      ? db.purchase.findMany({
          where: { itemId: id },
          orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
          take: 50,
          include: { recordedBy: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const quantity = toNumber(item.currentQuantity);
  const min = toNumber(item.minQuantity);
  const max = item.maxQuantity === null ? null : toNumber(item.maxQuantity);
  const status = stockStatus(quantity, min);

  return (
    <div>
      <KitchenTabs role={user.role} />
      <LinkButton href="/kitchen/stock" variant="ghost" size="sm" className="mb-3 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Stock
      </LinkButton>
      <PageHeader
        title={item.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {label(item.category)}
            {item.isActive ? <StatusBadge kind="stock" value={status} /> : <StatusBadge kind="active" value={false} />}
          </span>
        }
        actions={
          <>
            {canRequest && item.isActive && (
              <LinkButton href={`/kitchen/requests?item=${item.id}`}>
                <ShoppingCart className="h-4 w-4" /> Request
              </LinkButton>
            )}
            {canManage && item.isActive && (
              <Dialog trigger={<><SlidersHorizontal className="h-4 w-4" /> Adjust stock</>} triggerVariant="primary" title={`Adjust stock — ${item.name}`}>
                <AdjustStockForm item={{ id: item.id, name: item.name, unit: item.unit, quantity }} />
              </Dialog>
            )}
          </>
        }
      />

      <div className="grid gap-5 @6xl:grid-cols-3">
        <Card
          title="Details"
          action={
            canManage ? (
              <Dialog trigger={<Pencil className="h-4 w-4" />} triggerVariant="ghost" triggerSize="icon" triggerClassName="h-8 w-8" title={`Edit ${item.name}`} wide>
                <StockItemForm
                  initial={{ id: item.id, name: item.name, category: item.category, unit: item.unit, minQuantity: min, maxQuantity: max, supplier: item.supplier, notes: item.notes }}
                />
              </Dialog>
            ) : undefined
          }
        >
          <div className="mb-5">
            <div className="tabular text-3xl font-semibold tracking-tight text-ink">
              {formatNumber(quantity, 3)} <span className="text-base font-normal text-ink-3">{item.unit}</span>
            </div>
            <ProgressBar className="mt-3" value={levelPercent(quantity, min, max)} tone={levelTone(status)} />
          </div>
          <DetailList
            items={[
              { label: "Minimum", value: `${formatNumber(min, 3)} ${item.unit}` },
              { label: "Maximum", value: max === null ? "—" : `${formatNumber(max, 3)} ${item.unit}` },
              { label: "Supplier", value: item.supplier ?? "—" },
              { label: "Added", value: formatDate(item.createdAt) },
              { label: "Notes", value: item.notes ?? "—" },
            ]}
          />
          {canManage && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
              <ConfirmAction
                action={setStockItemActive}
                payload={{ id: item.id, active: !item.isActive }}
                label={<><Power className="h-4 w-4" /> {item.isActive ? "Deactivate" : "Reactivate"}</>}
                title={item.isActive ? `Deactivate ${item.name}?` : `Reactivate ${item.name}?`}
                message={
                  item.isActive
                    ? "It will be hidden from purchase and request forms and from stock alerts. History is kept."
                    : "It will appear again in stock lists, forms and alerts."
                }
                confirmLabel={item.isActive ? "Deactivate" : "Reactivate"}
              />
              <ConfirmAction
                action={removeStockItem}
                payload={{ id: item.id }}
                label={<><Trash2 className="h-4 w-4" /> Remove</>}
                variant="ghost"
                title={`Remove ${item.name}?`}
                message="The item is removed from all lists. Its movement history and purchases are kept for the records."
                confirmLabel="Remove"
                confirmVariant="danger"
              />
            </div>
          )}
        </Card>

        <Card title="Movement history" subtitle="Latest 100 stock movements" className="@6xl:col-span-2">
          {moves.length === 0 ? (
            <EmptyState icon={<History className="h-5 w-5" />} title="No movements yet" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH align="right">Change</TH>
                  <TH align="right">Balance</TH>
                  <TH>Reason</TH>
                  <TH>By</TH>
                </tr>
              </THead>
              <tbody>
                {moves.map((m) => {
                  const change = toNumber(m.quantityChange);
                  return (
                    <tr key={m.id}>
                      <TD className="whitespace-nowrap text-ink-2">{formatDateTime(m.createdAt)}</TD>
                      <TD>
                        <Badge tone={TYPE_TONE[m.type]}>{label(m.type)}</Badge>
                      </TD>
                      <TD align="right" className={cn("font-medium", change > 0 ? "text-good" : change < 0 ? "text-bad" : "")}>
                        {change > 0 ? "+" : change < 0 ? "−" : ""}
                        {formatNumber(Math.abs(change), 3)}
                      </TD>
                      <TD align="right">{formatNumber(m.balanceAfter, 3)}</TD>
                      <TD className="max-w-65 text-ink-2">{m.reason ?? "—"}</TD>
                      <TD className="whitespace-nowrap text-ink-2">{m.createdBy?.name ?? "—"}</TD>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        {canPurchases && (
          <Card title="Purchases" subtitle="Latest 50 purchases of this item" className="@6xl:col-span-3">
            {purchases.length === 0 ? (
              <EmptyState icon={<Receipt className="h-5 w-5" />} title="No purchases recorded" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH align="right">Quantity</TH>
                    <TH align="right">Unit cost</TH>
                    <TH align="right">Total</TH>
                    <TH>Supplier</TH>
                    <TH>Reference</TH>
                    <TH>Recorded by</TH>
                  </tr>
                </THead>
                <tbody>
                  {purchases.map((p) => {
                    const voided = !!p.voidedAt;
                    return (
                      <tr key={p.id} className={voided ? "opacity-60" : undefined}>
                        <TD className="whitespace-nowrap">
                          <span className={voided ? "line-through" : undefined}>{formatDate(p.purchaseDate)}</span>
                          {voided && <Badge tone="bad" className="ml-2">Voided</Badge>}
                        </TD>
                        <TD align="right" className={voided ? "line-through" : undefined}>
                          {formatNumber(p.quantity, 3)} {p.unit}
                        </TD>
                        <TD align="right" className={voided ? "line-through" : undefined}>{formatMoney(p.unitCost)}</TD>
                        <TD align="right" className={cn("font-medium", voided && "line-through")}>{formatMoney(p.totalCost)}</TD>
                        <TD className="text-ink-2">{p.supplier ?? "—"}</TD>
                        <TD className="text-ink-2">{p.reference ?? "—"}</TD>
                        <TD className="text-ink-2">{p.recordedBy?.name ?? "—"}</TD>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
