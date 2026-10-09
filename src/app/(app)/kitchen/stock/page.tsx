import Link from "next/link";
import { AlertTriangle, Boxes, PackageX, Pencil, Plus, ShoppingCart, SlidersHorizontal } from "lucide-react";
import type { InventoryCategory, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { stockStatus } from "@/lib/services/inventory";
import { formatNumber, label, toNumber } from "@/lib/format";
import { sp } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Card, EmptyState, FilterTabs, LinkButton, PageHeader, ProgressBar, StatCard, Table, TD, TH, THead } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { KitchenTabs } from "../kitchen-tabs";
import { FilterBar, FilterField, filterControlClass } from "../filter-bar";
import { INVENTORY_CATEGORIES } from "../constants";
import { AdjustStockForm, StockItemForm } from "./stock-forms";
import { levelPercent, levelTone } from "./stock-utils";

export const metadata = { title: "Stock" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function StockPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePermission("stock.view");
  const params = await searchParams;
  const status = sp(params, "status") ?? "all";
  const q = (sp(params, "q") ?? "").trim().slice(0, 80);
  const categoryParam = sp(params, "category");
  const category = INVENTORY_CATEGORIES.includes(categoryParam as never) ? (categoryParam as InventoryCategory) : undefined;
  const canManage = can(user.role, "stock.manage");
  const canRequest = can(user.role, "shopping.create");

  const where: Prisma.InventoryItemWhereInput = {
    deletedAt: null,
    isActive: status === "inactive" ? false : true,
    ...(category ? { category } : {}),
    ...(q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { supplier: { contains: q, mode: "insensitive" } }] }
      : {}),
  };
  const [rows, activeAll, inactiveCount] = await Promise.all([
    db.inventoryItem.findMany({ where, orderBy: { name: "asc" } }),
    db.inventoryItem.findMany({
      where: { deletedAt: null, isActive: true },
      select: { currentQuantity: true, minQuantity: true },
    }),
    db.inventoryItem.count({ where: { deletedAt: null, isActive: false } }),
  ]);

  const items = rows.map((i) => {
    const quantity = toNumber(i.currentQuantity);
    const min = toNumber(i.minQuantity);
    const max = i.maxQuantity === null ? null : toNumber(i.maxQuantity);
    return { ...i, quantity, min, max, status: stockStatus(quantity, min) };
  });
  const filtered = items.filter((i) =>
    status === "low" ? i.status === "LOW_STOCK" : status === "out" ? i.status === "OUT_OF_STOCK" : true,
  );

  const statuses = activeAll.map((i) => stockStatus(toNumber(i.currentQuantity), toNumber(i.minQuantity)));
  const lowCount = statuses.filter((s) => s === "LOW_STOCK").length;
  const outCount = statuses.filter((s) => s === "OUT_OF_STOCK").length;

  const qs = (s: string) => {
    const p = new URLSearchParams();
    if (s !== "all") p.set("status", s);
    if (category) p.set("category", category);
    if (q) p.set("q", q);
    const str = p.toString();
    return `/kitchen/stock${str ? `?${str}` : ""}`;
  };

  return (
    <div>
      <KitchenTabs role={user.role} />
      <PageHeader
        title="Stock"
        description="Kitchen store balances. Purchases add stock; usage, waste and counts adjust it."
        actions={
          <>
            {canRequest && (
              <LinkButton href="/kitchen/requests?new=1" variant="secondary">
                <ShoppingCart className="h-4 w-4" /> Report low stock
              </LinkButton>
            )}
            {canManage && (
              <Dialog trigger={<><Plus className="h-4 w-4" /> Add item</>} triggerVariant="primary" title="Add stock item" wide>
                <StockItemForm />
              </Dialog>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 @xl:grid-cols-3">
        <StatCard label="Active items" value={activeAll.length} icon={<Boxes className="h-4 w-4" />} tone="accent" href="/kitchen/stock" />
        <StatCard label="Low stock" value={lowCount} icon={<AlertTriangle className="h-4 w-4" />} tone="warn" href="/kitchen/stock?status=low" />
        <StatCard label="Out of stock" value={outCount} icon={<PackageX className="h-4 w-4" />} tone="bad" href="/kitchen/stock?status=out" />
      </div>

      <Card>
        <div className="mb-3">
          <FilterTabs
            active={status}
            tabs={[
              { label: "All", value: "all", href: qs("all"), count: activeAll.length },
              { label: "Low", value: "low", href: qs("low"), count: lowCount },
              { label: "Out", value: "out", href: qs("out"), count: outCount },
              { label: "Inactive", value: "inactive", href: qs("inactive"), count: inactiveCount },
            ]}
          />
        </div>
        <FilterBar resetHref="/kitchen/stock" hidden={{ status: status !== "all" ? status : undefined }}>
          <FilterField label="Search">
            <input name="q" defaultValue={q} placeholder="Item or supplier" className={filterControlClass} />
          </FilterField>
          <FilterField label="Category">
            <select name="category" defaultValue={category ?? ""} className={filterControlClass}>
              <option value="">All categories</option>
              {INVENTORY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </select>
          </FilterField>
        </FilterBar>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Boxes className="h-5 w-5" />}
            title={items.length === 0 && !q && !category && status === "all" ? "No stock items yet" : "No items match these filters"}
            description={canManage ? "Add the items you keep in the kitchen store to start tracking balances." : undefined}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Item</TH>
                <TH>Category</TH>
                <TH align="right">Quantity</TH>
                <TH align="right">Min</TH>
                <TH align="right">Max</TH>
                <TH>Level</TH>
                <TH>Status</TH>
                <TH>Supplier</TH>
                <TH align="right">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <TD>
                    <Link href={`/kitchen/stock/${i.id}`} className="font-medium text-ink hover:text-accent-hi">
                      {i.name}
                    </Link>
                  </TD>
                  <TD className="text-ink-2">{label(i.category)}</TD>
                  <TD align="right" className="whitespace-nowrap font-medium">
                    {formatNumber(i.quantity, 3)} <span className="text-xs font-normal text-ink-3">{i.unit}</span>
                  </TD>
                  <TD align="right" className="text-ink-2">{formatNumber(i.min, 3)}</TD>
                  <TD align="right" className="text-ink-2">{i.max === null ? "—" : formatNumber(i.max, 3)}</TD>
                  <TD className="min-w-22.5">
                    <ProgressBar value={levelPercent(i.quantity, i.min, i.max)} tone={levelTone(i.status)} />
                  </TD>
                  <TD>
                    {i.isActive ? <StatusBadge kind="stock" value={i.status} /> : <StatusBadge kind="active" value={false} />}
                  </TD>
                  <TD className="text-ink-2">{i.supplier ?? "—"}</TD>
                  <TD align="right">
                    <div className="flex justify-end gap-1">
                      {canRequest && i.isActive && i.status !== "IN_STOCK" && (
                        <LinkButton href={`/kitchen/requests?item=${i.id}`} variant="ghost" size="icon" className="h-8 w-8" aria-label={`Request ${i.name}`} title="Request">
                          <ShoppingCart className="h-4 w-4" />
                        </LinkButton>
                      )}
                      {canManage && i.isActive && (
                        <Dialog
                          trigger={<SlidersHorizontal className="h-4 w-4" />}
                          triggerVariant="ghost"
                          triggerSize="icon"
                          triggerClassName="h-8 w-8"
                          title={`Adjust stock — ${i.name}`}
                          description="Record usage, waste, or correct the balance after a count."
                        >
                          <AdjustStockForm item={{ id: i.id, name: i.name, unit: i.unit, quantity: i.quantity }} />
                        </Dialog>
                      )}
                      {canManage && (
                        <Dialog trigger={<Pencil className="h-4 w-4" />} triggerVariant="ghost" triggerSize="icon" triggerClassName="h-8 w-8" title={`Edit ${i.name}`} wide>
                          <StockItemForm
                            initial={{
                              id: i.id,
                              name: i.name,
                              category: i.category,
                              unit: i.unit,
                              minQuantity: i.min,
                              maxQuantity: i.max,
                              supplier: i.supplier,
                              notes: i.notes,
                            }}
                          />
                        </Dialog>
                      )}
                    </div>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
