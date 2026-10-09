"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { can, type Permission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; permission: Permission }[] = [
  { href: "/kitchen", label: "Overview", permission: "stock.view" },
  { href: "/kitchen/today", label: "Today's meals", permission: "meals.expected" },
  { href: "/kitchen/stock", label: "Stock", permission: "stock.view" },
  { href: "/kitchen/purchases", label: "Purchases", permission: "purchases.view" },
  { href: "/kitchen/requests", label: "Requests", permission: "shopping.view" },
  { href: "/kitchen/expenses", label: "Expenses", permission: "expenses.view" },
  { href: "/kitchen/records", label: "Meal records", permission: "meals.record" },
];

/**
 * Kitchen sub-navigation for owners and managers (kitchen staff use the sidebar).
 * Render at the top of every /kitchen/* page: <KitchenTabs role={user.role} />
 */
export function KitchenTabs({ role }: { role: Role }) {
  const pathname = usePathname();
  if (role !== "OWNER" && role !== "HOSTEL_MANAGER") return null;
  const tabs = TABS.filter((t) => can(role, t.permission));
  // Longest-prefix match so /kitchen/stock/abc highlights "Stock", not "Overview".
  let active: string | null = null;
  for (const t of tabs) {
    if (pathname === t.href || pathname.startsWith(t.href + "/")) {
      if (!active || t.href.length > active.length) active = t.href;
    }
  }
  return (
    <nav aria-label="Kitchen sections" className="no-scrollbar -mx-1 mb-5 flex gap-1 overflow-x-auto px-1">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={cn(
            "inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-xs font-medium transition-colors",
            t.href === active ? "bg-card-3 text-ink" : "text-ink-2 hover:bg-card-2 hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
