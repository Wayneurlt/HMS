import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, ClipboardList, Coffee, Flame, Receipt, ShoppingCart, Soup, UtensilsCrossed, Wallet } from "lucide-react";
import type { MealType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDayLong, formatMonth, monthStart, today } from "@/lib/dates";
import { formatMoney, formatNumber, round2, toNumber } from "@/lib/format";
import { mealExpectation } from "@/lib/services/attendance";
import { stockAlerts } from "@/lib/services/inventory";
import { Badge, Card, EmptyState, LinkButton, PageHeader, StatCard } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { KitchenTabs } from "./kitchen-tabs";

export const metadata = { title: "Kitchen" };

export default async function KitchenDashboardPage() {
  const user = await requireUser();
  if (!can(user.role, "stock.view")) redirect("/forbidden");

  const role = user.role;
  const canPurchases = can(role, "purchases.view");
  const canExpenses = can(role, "expenses.view");
  const canRequest = can(role, "shopping.create");
  const canRecordPurchase = can(role, "purchases.record");
  const canSpend = can(role, "reports.kitchen"); // owner-only kitchen spend figures
  const canMeals = can(role, "meals.expected");

  const t = today();
  const mStart = monthStart(t);

  const [meals, breakfast, dinner, alerts, pending, pendingCount, approvedCount, todaysPurchases, todaysExpenses, mtdPurchases, mtdExpenses, mtdFood] =
    await Promise.all([
      db.meal.findMany({ where: { date: t }, include: { record: true } }),
      canMeals ? mealExpectation(t, "BREAKFAST") : Promise.resolve(null),
      canMeals ? mealExpectation(t, "DINNER") : Promise.resolve(null),
      stockAlerts(),
      db.shoppingRequest.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { items: { select: { name: true } }, requestedBy: { select: { name: true } } },
      }),
      db.shoppingRequest.count({ where: { status: "PENDING" } }),
      db.shoppingRequest.count({ where: { status: "APPROVED" } }),
      canPurchases
        ? db.purchase.findMany({
            where: { purchaseDate: t, voidedAt: null },
            orderBy: { createdAt: "desc" },
            include: { item: { select: { name: true } } },
          })
        : Promise.resolve([]),
      canExpenses
        ? db.kitchenExpense.findMany({ where: { expenseDate: t, voidedAt: null }, orderBy: { createdAt: "desc" } })
        : Promise.resolve([]),
      canSpend
        ? db.purchase.aggregate({ where: { purchaseDate: { gte: mStart, lte: t }, voidedAt: null }, _sum: { totalCost: true } })
        : Promise.resolve(null),
      canSpend
        ? db.kitchenExpense.aggregate({ where: { expenseDate: { gte: mStart, lte: t }, voidedAt: null }, _sum: { amount: true } })
        : Promise.resolve(null),
      canSpend
        ? db.kitchenExpense.aggregate({ where: { expenseDate: { gte: mStart, lte: t }, voidedAt: null, category: "FOOD" }, _sum: { amount: true } })
        : Promise.resolve(null),
    ]);

  const mealOf = (type: MealType) => meals.find((m) => m.type === type);
  const alertItems = [...alerts.out, ...alerts.low];
  const purchasesToday = round2(todaysPurchases.reduce((a, p) => a + toNumber(p.totalCost), 0));
  const expensesToday = round2(todaysExpenses.reduce((a, e) => a + toNumber(e.amount), 0));
  const recordedMeals = meals.filter((m) => m.record);

  const mtdP = toNumber(mtdPurchases?._sum.totalCost);
  const mtdE = toNumber(mtdExpenses?._sum.amount);
  const mtdF = round2(mtdP + toNumber(mtdFood?._sum.amount));

  return (
    <div>
      <KitchenTabs role={role} />
      <PageHeader
        title="Kitchen"
        description={formatDayLong(t)}
        actions={
          <>
            {canRequest && (
              <LinkButton href="/kitchen/requests?new=1">
                <ShoppingCart className="h-4 w-4" /> New request
              </LinkButton>
            )}
            {canRecordPurchase && (
              <LinkButton href="/kitchen/purchases" variant="primary">
                <Receipt className="h-4 w-4" /> Record purchase
              </LinkButton>
            )}
          </>
        }
      />

      {/* Today's meals */}
      {canMeals && (
        <div className="mb-5 grid gap-4 @2xl:grid-cols-2">
          {(
            [
              ["BREAKFAST", "Breakfast", breakfast, <Coffee key="b" className="h-4 w-4" />],
              ["DINNER", "Dinner", dinner, <Soup key="d" className="h-4 w-4" />],
            ] as const
          ).map(([type, title, exp, icon]) => {
            const meal = mealOf(type);
            return (
              <Link
                key={type}
                href="/kitchen/today"
                className="group flex flex-col justify-between gap-4 rounded-card border border-line bg-card p-5 transition-colors hover:border-line-2 hover:bg-card-2/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm text-ink-2">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-lo text-accent-hi">{icon}</span>
                      {title}
                    </div>
                    <p className={meal ? "mt-3 text-[15px] font-medium text-ink" : "mt-3 text-sm text-ink-3"}>{meal ? meal.menu : "No menu set"}</p>
                  </div>
                  <div className="text-right">
                    <div className="tabular text-4xl font-semibold tracking-tight text-ink">{exp?.expected ?? 0}</div>
                    <div className="text-xs text-ink-3">expected</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
                  <span>
                    {exp?.away ?? 0} away · {exp?.residents ?? 0} residents
                  </span>
                  {meal?.record ? (
                    <Badge tone="good">
                      Served {meal.record.servedCount} · {formatNumber(meal.record.leftoverPortions)} left over
                    </Badge>
                  ) : (
                    <span className="flex items-center gap-1 text-accent-hi">
                      Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Owner: month-to-date kitchen spend */}
      {canSpend && (
        <div className="mb-5 grid grid-cols-1 gap-3 @xl:grid-cols-2 @6xl:grid-cols-4">
          <StatCard label="Purchases this month" value={formatMoney(mtdP)} hint={`${formatMonth(t, "long")} to date`} icon={<Receipt className="h-4 w-4" />} tone="accent" href="/kitchen/purchases" />
          <StatCard label="Expenses this month" value={formatMoney(mtdE)} hint="Gas, water, supplies…" icon={<Wallet className="h-4 w-4" />} tone="info" href="/kitchen/expenses" />
          <StatCard label="Total kitchen spend" value={formatMoney(round2(mtdP + mtdE))} hint="Purchases + expenses" icon={<Flame className="h-4 w-4" />} tone="warn" />
          <StatCard label="Food cost" value={formatMoney(mtdF)} hint="Purchases + food expenses" icon={<UtensilsCrossed className="h-4 w-4" />} tone="good" />
        </div>
      )}

      <div className="grid gap-5 @6xl:grid-cols-2">
        {/* Stock alerts */}
        <Card
          title="Stock alerts"
          subtitle={`${alerts.out.length} out of stock · ${alerts.low.length} low`}
          action={<LinkButton href="/kitchen/stock" variant="ghost" size="sm">All stock</LinkButton>}
        >
          {alertItems.length === 0 ? (
            <EmptyState icon={<AlertTriangle className="h-5 w-5" />} title="Stock levels look good" description="Nothing is below its minimum level." />
          ) : (
            <ul className="divide-y divide-line/70">
              {alertItems.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/kitchen/stock/${i.id}`} className="block truncate text-sm font-medium text-ink hover:text-accent-hi">
                      {i.name}
                    </Link>
                    <p className="text-xs text-ink-3 tabular">
                      {formatNumber(i.quantity, 3)} {i.unit} · min {formatNumber(i.minQuantity, 3)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge kind="stock" value={i.status} />
                    {canRequest && (
                      <LinkButton href={`/kitchen/requests?item=${i.id}`} size="sm" variant="outline">
                        Request
                      </LinkButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Pending shopping requests */}
        <Card
          title="Pending shopping requests"
          subtitle={`${pendingCount} waiting for approval${approvedCount ? ` · ${approvedCount} approved to buy` : ""}`}
          action={<LinkButton href="/kitchen/requests" variant="ghost" size="sm">All requests</LinkButton>}
        >
          {pending.length === 0 ? (
            <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No pending requests" />
          ) : (
            <ul className="divide-y divide-line/70">
              {pending.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{r.items.map((i) => i.name).join(", ")}</p>
                    <p className="text-xs text-ink-3">{r.requestedBy?.name ?? "Unknown"}</p>
                  </div>
                  <StatusBadge kind="priority" value={r.priority} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Today's activity */}
        <Card title="Today's activity" className="@6xl:col-span-2">
          <div className={`grid gap-6 ${canPurchases || canExpenses ? "@2xl:grid-cols-3" : ""}`}>
            {canPurchases && (
              <section>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-ink-3">Purchases</h3>
                  <span className="text-xs tabular text-ink-2">{formatMoney(purchasesToday)}</span>
                </div>
                {todaysPurchases.length === 0 ? (
                  <p className="text-sm text-ink-3">None today.</p>
                ) : (
                  <ul className="space-y-2">
                    {todaysPurchases.map((p) => (
                      <li key={p.id} className="flex justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-ink">
                          {p.item.name} <span className="text-xs text-ink-3">{formatNumber(p.quantity, 3)} {p.unit}</span>
                        </span>
                        <span className="shrink-0 tabular text-ink-2">{formatMoney(p.totalCost)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            {canExpenses && (
              <section>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-ink-3">Expenses</h3>
                  <span className="text-xs tabular text-ink-2">{formatMoney(expensesToday)}</span>
                </div>
                {todaysExpenses.length === 0 ? (
                  <p className="text-sm text-ink-3">None today.</p>
                ) : (
                  <ul className="space-y-2">
                    {todaysExpenses.map((e) => (
                      <li key={e.id} className="flex justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-ink">{e.description}</span>
                        <span className="shrink-0 tabular text-ink-2">{formatMoney(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Meals served</h3>
              {recordedMeals.length === 0 ? (
                <p className="text-sm text-ink-3">No meals recorded yet today.</p>
              ) : (
                <ul className="space-y-2">
                  {recordedMeals
                    .sort((a, b) => (a.type === "BREAKFAST" ? -1 : b.type === "BREAKFAST" ? 1 : 0))
                    .map((m) => (
                      <li key={m.id} className="flex justify-between gap-3 text-sm">
                        <span className="text-ink">{m.type === "BREAKFAST" ? "Breakfast" : "Dinner"}</span>
                        <span className="tabular text-ink-2">
                          {m.record!.servedCount} served · {formatNumber(m.record!.leftoverPortions)} leftover
                        </span>
                      </li>
                    ))}
                </ul>
              )}
              <Link href="/kitchen/records" className="mt-1 inline-flex items-center gap-1 py-2 text-xs text-accent-hi hover:underline">
                Meal records <ArrowRight className="h-3 w-3" />
              </Link>
            </section>
          </div>
        </Card>
      </div>
    </div>
  );
}
