/**
 * Role-based access control. Single source of truth for what each role may do.
 * Client-safe (no server imports) so navigation can use it, but navigation is NOT the
 * security boundary: every page, server action and route handler re-checks on the server
 * via requirePermission()/authorize() in src/lib/auth/guards.ts.
 */
import type { Role } from "@prisma/client";

const OWNER: Role = "OWNER";
const MANAGER: Role = "HOSTEL_MANAGER";
const KITCHEN: Role = "KITCHEN_STAFF";
const STUDENT: Role = "STUDENT";

export const PERMISSIONS = {
  // Admin dashboard (owner + manager). Kitchen & students have their own dashboards.
  "dashboard.admin": [OWNER, MANAGER],
  "dashboard.finance": [OWNER], // kitchen spend & owner-only figures on the admin dashboard

  "students.view": [OWNER, MANAGER],
  "students.manage": [OWNER, MANAGER], // create/edit/check-in/check-out

  "rooms.view": [OWNER, MANAGER],
  "rooms.manage": [OWNER, MANAGER],

  "rent.view": [OWNER, MANAGER],
  "rent.manage": [OWNER, MANAGER], // record payments, generate invoices, edit notes
  "rent.adjust": [OWNER], // edit invoice amounts, void invoices, edit/void payments
  "reminders.view": [OWNER, MANAGER],
  "reminders.manage": [OWNER], // reminder schedule config

  "overnight.view": [OWNER, MANAGER],
  "overnight.manage": [OWNER, MANAGER], // set status on behalf of students

  "meals.view": [OWNER, MANAGER, KITCHEN, STUDENT],
  "meals.manage": [OWNER, MANAGER], // timetable
  "meals.expected": [OWNER, MANAGER, KITCHEN], // expected counts & names
  "meals.record": [OWNER, MANAGER, KITCHEN], // served / leftovers / attendance

  "kitchen.dashboard": [KITCHEN],
  "kitchen.view": [OWNER, KITCHEN], // kitchen overview pages (stock, purchases, expenses)
  "stock.view": [OWNER, MANAGER, KITCHEN],
  "stock.manage": [OWNER, KITCHEN],
  "purchases.view": [OWNER, KITCHEN],
  "purchases.record": [OWNER, KITCHEN],
  "purchases.void": [OWNER],
  "shopping.view": [OWNER, MANAGER, KITCHEN],
  "shopping.create": [OWNER, KITCHEN],
  "shopping.review": [OWNER, MANAGER],
  "expenses.view": [OWNER, KITCHEN],
  "expenses.record": [OWNER, KITCHEN],
  "expenses.void": [OWNER],

  "announcements.view": [OWNER, MANAGER, KITCHEN, STUDENT],
  "announcements.manage": [OWNER, MANAGER],

  "reports.operational": [OWNER, MANAGER], // occupancy, rent, students
  "reports.kitchen": [OWNER], // kitchen spend, cost per meal

  "notifications.view": [OWNER, MANAGER, KITCHEN, STUDENT],

  "users.view": [OWNER, MANAGER],
  "users.manage": [OWNER], // create/edit staff & owner accounts
  "settings.manage": [OWNER],
  "activity.view": [OWNER],

  "self.student": [STUDENT], // student self-service portal
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function canAny(role: Role | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

/** Where each role lands after login. */
export function homePathFor(role: Role): string {
  switch (role) {
    case "OWNER":
    case "HOSTEL_MANAGER":
      return "/dashboard";
    case "KITCHEN_STAFF":
      return "/kitchen";
    case "STUDENT":
      return "/me";
  }
}

/** Roles a manager is allowed to create/manage (owners manage everyone). */
export function manageableRoles(actor: Role): Role[] {
  if (actor === "OWNER") return [OWNER, MANAGER, KITCHEN, STUDENT];
  if (actor === "HOSTEL_MANAGER") return [STUDENT];
  return [];
}
