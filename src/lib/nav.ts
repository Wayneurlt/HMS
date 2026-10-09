/**
 * Role-aware navigation. Client-safe. This only decides what is SHOWN — access is enforced
 * server-side on every page and action.
 */
import type { Role } from "@prisma/client";
import { can, type Permission } from "@/lib/auth/permissions";

export type IconName =
  | "dashboard"
  | "students"
  | "rooms"
  | "rent"
  | "overnight"
  | "meals"
  | "kitchen"
  | "announcements"
  | "reports"
  | "notifications"
  | "users"
  | "settings"
  | "activity"
  | "stock"
  | "purchases"
  | "requests"
  | "expenses"
  | "records"
  | "today"
  | "profile"
  | "room";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  permission?: Permission;
  /** Shown in the top pill bar on desktop. */
  primary?: boolean;
};

const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", permission: "dashboard.admin", primary: true },
  { href: "/students", label: "Students", icon: "students", permission: "students.view", primary: true },
  { href: "/rooms", label: "Rooms & Beds", icon: "rooms", permission: "rooms.view" },
  { href: "/rent", label: "Rent", icon: "rent", permission: "rent.view", primary: true },
  { href: "/overnight", label: "Overnight", icon: "overnight", permission: "overnight.view" },
  { href: "/meals", label: "Meals", icon: "meals", permission: "meals.manage" },
  { href: "/kitchen", label: "Kitchen", icon: "kitchen", permission: "stock.view", primary: true },
  { href: "/announcements", label: "Announcements", icon: "announcements", permission: "announcements.manage" },
  { href: "/reports", label: "Reports", icon: "reports", permission: "reports.operational", primary: true },
  { href: "/notifications", label: "Notifications", icon: "notifications" },
  { href: "/users", label: "Users", icon: "users", permission: "users.view" },
  { href: "/settings", label: "Settings", icon: "settings", permission: "settings.manage" },
  { href: "/activity", label: "Activity Log", icon: "activity", permission: "activity.view" },
];

const KITCHEN_NAV: NavItem[] = [
  { href: "/kitchen", label: "Dashboard", icon: "dashboard", primary: true },
  { href: "/kitchen/today", label: "Today's Meals", icon: "today", primary: true },
  { href: "/kitchen/stock", label: "Stock", icon: "stock", primary: true },
  { href: "/kitchen/purchases", label: "Purchases", icon: "purchases", primary: true },
  { href: "/kitchen/requests", label: "Shopping Requests", icon: "requests", primary: true },
  { href: "/kitchen/expenses", label: "Expenses", icon: "expenses" },
  { href: "/kitchen/records", label: "Meal Records", icon: "records" },
  { href: "/notifications", label: "Notifications", icon: "notifications" },
];

const STUDENT_NAV: NavItem[] = [
  { href: "/me", label: "Dashboard", icon: "dashboard", primary: true },
  { href: "/me/profile", label: "My Profile", icon: "profile" },
  { href: "/me/room", label: "My Room", icon: "room" },
  { href: "/me/rent", label: "My Rent", icon: "rent", primary: true },
  { href: "/me/overnight", label: "My Overnight Status", icon: "overnight", primary: true },
  { href: "/me/meals", label: "Meals", icon: "meals", primary: true },
  { href: "/me/announcements", label: "Announcements", icon: "announcements", primary: true },
  { href: "/notifications", label: "Notifications", icon: "notifications" },
];

export function navFor(role: Role): NavItem[] {
  const base = role === "STUDENT" ? STUDENT_NAV : role === "KITCHEN_STAFF" ? KITCHEN_NAV : ADMIN_NAV;
  return base.filter((i) => !i.permission || can(role, i.permission));
}

/** Longest-prefix match so /students/abc highlights "Students" and /kitchen/stock beats /kitchen. */
export function activeHref(items: NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const i of items) {
    if (pathname === i.href || pathname.startsWith(i.href + "/")) {
      if (!best || i.href.length > best.length) best = i.href;
    }
  }
  return best;
}
