"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  BedDouble,
  CalendarDays,
  ChefHat,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  DoorOpen,
  Ellipsis,
  History,
  Info,
  KeyRound,
  LayoutGrid,
  LogOut,
  Megaphone,
  Moon,
  NotebookPen,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  User,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { activeHref, type IconName, type NavItem } from "@/lib/nav";
import { label } from "@/lib/format";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/(auth)/actions";
import { MasqaniLogo } from "@/components/brand/masqani-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { setPreferenceCookie, SIDEBAR_COOKIE } from "@/lib/preferences";

const ICONS: Record<IconName, typeof LayoutGrid> = {
  dashboard: LayoutGrid,
  students: Users,
  rooms: BedDouble,
  rent: Wallet,
  overnight: Moon,
  meals: UtensilsCrossed,
  kitchen: ChefHat,
  announcements: Megaphone,
  reports: BarChart3,
  notifications: Bell,
  users: UserCog,
  settings: Settings,
  activity: History,
  stock: Package,
  purchases: ShoppingCart,
  requests: ClipboardList,
  expenses: Receipt,
  records: NotebookPen,
  today: CalendarDays,
  profile: User,
  room: DoorOpen,
};

export type ShellUser = { name: string; email: string | null; phone: string | null; role: Role };

export function AppShell({
  user,
  nav,
  unread,
  sidebarExpanded,
  children,
}: {
  user: ShellUser;
  nav: NavItem[];
  unread: number;
  /** Initial sidebar state from the preference cookie. */
  sidebarExpanded: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = activeHref(nav, pathname);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [expanded, setExpanded] = useState(sidebarExpanded);
  const toggleSidebar = () => {
    setExpanded((e) => {
      setPreferenceCookie(SIDEBAR_COOKIE, e ? "collapsed" : "expanded");
      return !e;
    });
  };
  const primary = nav.filter((n) => n.primary);
  const isAdmin = user.role === "OWNER" || user.role === "HOSTEL_MANAGER";
  const infoHref = user.role === "STUDENT" ? "/me/announcements" : isAdmin ? "/announcements" : "/notifications";

  useEffect(() => {
    setDrawer(false);
    setMenu(false);
  }, [pathname]);

  return (
    <div className="min-h-dvh bg-page">
      <div className="flex min-h-dvh w-full flex-col px-3 pb-22 sm:px-5 lg:pb-6">
        {/* ── Top bar ── */}
        <header className="sticky top-0 z-40 -mx-3 flex h-[calc(4.75rem+env(safe-area-inset-top))] items-center gap-3 bg-page/85 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:-mx-5 sm:px-5">
          <Link href={nav[0]?.href ?? "/"} className="flex h-12 shrink-0 items-center rounded-full border border-line bg-card px-3">
            <MasqaniLogo variant="inline" className="h-8" />
          </Link>

          <nav className="no-scrollbar mx-auto hidden items-center gap-1.5 overflow-x-auto xl:flex" aria-label="Primary">
            {primary.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-11 items-center rounded-full border px-5 text-sm transition-colors",
                  active === item.href
                    ? "border-line-2 bg-card-3 text-ink"
                    : "border-line bg-card text-ink-2 hover:bg-card-2 hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 xl:ml-0">
            <div className="flex h-12 items-center gap-1 rounded-full border border-line bg-card px-1.5">
              {isAdmin && (
                <Link href="/students" className="hidden h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-card-3 hover:text-ink sm:grid" aria-label="Search students">
                  <Search className="h-4.5 w-4.5" />
                </Link>
              )}
              <ThemeToggle />
              <Link href="/notifications" className="relative grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-card-3 hover:text-ink" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
                <Bell className="h-4.5 w-4.5" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ef5a3c] px-1 text-[9px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <Link href={infoHref} className="hidden h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-card-3 hover:text-ink sm:grid" aria-label="Announcements">
                <Info className="h-4.5 w-4.5" />
              </Link>
            </div>

            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setMenu((m) => !m)}
                className="flex h-12 items-center gap-2.5 rounded-full border border-line bg-card pl-1.5 pr-3 text-left hover:bg-card-2"
                aria-expanded={menu}
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#ef6a3c] text-xs font-bold text-white">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="hidden min-w-0 md:block">
                  <span className="block max-w-37.5 truncate text-[13px] font-medium leading-tight text-ink">{user.name}</span>
                  <span className="block max-w-37.5 truncate text-[11px] leading-tight text-ink-3">{user.email ?? user.phone ?? label(user.role)}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-ink-3" />
              </button>
              {menu && (
                <div className="absolute right-0 top-14 w-60 rounded-2xl border border-line-2 bg-card-2 p-2 shadow-2xl">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium text-ink">{user.name}</p>
                    <p className="text-xs text-ink-3">{label(user.role)}</p>
                  </div>
                  <Link href="/account" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-2 hover:bg-card-3 hover:text-ink">
                    <KeyRound className="h-4 w-4" /> Account & password
                  </Link>
                  <form action={logoutAction}>
                    <button type="submit" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-2 hover:bg-card-3 hover:text-bad">
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>

          </div>
        </header>

        <div className="flex flex-1 gap-5 pt-2">
          {/* ── Sidebar: expanded (icons + labels) or collapsed (icons only) ── */}
          <aside
            className={cn(
              "sticky top-21.5 hidden h-[calc(100dvh-104px)] shrink-0 flex-col border border-line bg-card py-3 transition-[width] duration-200 lg:flex",
              expanded ? "w-60 rounded-3xl px-3" : "w-17 items-center rounded-full",
            )}
          >
            <button
              type="button"
              onClick={toggleSidebar}
              className={cn(
                "mb-2 flex h-10 shrink-0 items-center gap-3 rounded-full text-ink-3 transition-colors hover:bg-card-2 hover:text-ink",
                expanded ? "justify-between px-3" : "w-10 justify-center",
              )}
              aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
              aria-expanded={expanded}
              title={expanded ? "Collapse sidebar" : "Expand sidebar"}
            >
              {expanded && <span className="text-xs font-medium uppercase tracking-wider">Menu</span>}
              {expanded ? <PanelLeftClose className="h-4.5 w-4.5" /> : <PanelLeftOpen className="h-4.5 w-4.5" />}
            </button>
            <nav
              className={cn("-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1", !expanded && "items-center")}
              aria-label="Sections"
            >
              {nav.map((item) => {
                const Icon = ICONS[item.icon];
                const on = active === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex h-10 shrink-0 items-center rounded-full transition-colors [@media(max-height:820px)]:h-9",
                      expanded ? "gap-3 px-3 text-sm" : "w-10 justify-center",
                      on ? "bg-card-3 text-accent-hi" : "text-ink-2 hover:bg-card-2 hover:text-ink",
                    )}
                    aria-label={expanded ? undefined : item.label}
                    title={expanded ? undefined : item.label}
                    aria-current={on ? "page" : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {expanded && <span className={cn("truncate", on && "text-ink")}>{item.label}</span>}
                    {expanded && item.href === "/notifications" && unread > 0 && (
                      <span className="ml-auto rounded-full bg-[#ef5a3c] px-1.5 text-[10px] font-bold text-white">{unread}</span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <form action={logoutAction} className="mt-2 shrink-0 border-t border-line pt-2">
              <button
                type="submit"
                className={cn(
                  "flex h-10 items-center rounded-full text-ink-2 hover:bg-card-2 hover:text-bad",
                  expanded ? "w-full gap-3 px-3 text-sm" : "w-10 justify-center",
                )}
                aria-label="Sign out"
                title={expanded ? undefined : "Sign out"}
              >
                <LogOut className="h-5 w-5 shrink-0" />
                {expanded && "Sign out"}
              </button>
            </form>
          </aside>

          <main className="@container min-w-0 flex-1">{children}</main>
        </div>
      </div>

      {/* ── Mobile: bottom tab bar (iOS style) + "More" sheet ── */}
      <MobileTabBar nav={nav} active={active} moreOpen={drawer} onMore={() => setDrawer((d) => !d)} />
      {drawer && <MoreSheet nav={nav} active={active} user={user} unread={unread} onClose={() => setDrawer(false)} />}
    </div>
  );
}

// ───────── Mobile navigation ─────────

/** Bottom tab bar shown below the lg breakpoint: four role tabs + "More". */
function MobileTabBar({
  nav,
  active,
  moreOpen,
  onMore,
}: {
  nav: NavItem[];
  active: string | null;
  moreOpen: boolean;
  onMore: () => void;
}) {
  const tabs = nav.filter((n) => n.tab).slice(0, 4);
  const onTab = tabs.some((t) => t.href === active);
  const moreOn = moreOpen || (!onTab && active !== null);
  return (
    <nav
      aria-label="Tabs"
      className="bottom-tabs fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/85 backdrop-blur-xl backdrop-saturate-150 lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {tabs.map((item) => {
          const Icon = ICONS[item.icon];
          const on = active === item.href && !moreOpen;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium leading-none transition-colors",
                  on ? "text-ink" : "text-ink-3 active:text-ink",
                )}
              >
                <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", on && "bg-accent text-accent-ink")}>
                  <Icon className="h-5.5 w-5.5" strokeWidth={on ? 2.25 : 1.75} />
                </span>
                <span className={cn("max-w-full truncate px-1", on && "font-semibold")}>{item.short ?? item.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onMore}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className={cn(
              "flex h-14 w-full flex-col items-center justify-center gap-1 text-[10px] font-medium leading-none transition-colors",
              moreOn ? "text-ink" : "text-ink-3 active:text-ink",
            )}
          >
            <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", moreOn && "bg-accent text-accent-ink")}>
              <Ellipsis className="h-5.5 w-5.5" strokeWidth={moreOn ? 2.25 : 1.75} />
            </span>
            <span className={cn(moreOn && "font-semibold")}>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** Bottom sheet with every section that is not a tab, plus account and sign out. */
function MoreSheet({
  nav,
  active,
  user,
  unread,
  onClose,
}: {
  nav: NavItem[];
  active: string | null;
  user: ShellUser;
  unread: number;
  onClose: () => void;
}) {
  const rest = nav.filter((n) => !n.tab);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const row = "flex min-h-12 items-center gap-3 px-4 py-2.5 text-[15px] transition-colors active:bg-card-3";
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
      <div className="animate-fade absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="animate-sheet absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-3xl border-t border-line bg-page pb-4 shadow-2xl">
        <div className="flex shrink-0 justify-center pb-1 pt-2.5" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-line-2" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-1">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#ef6a3c] text-sm font-bold text-white">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-ink">{user.name}</p>
              <p className="truncate text-xs text-ink-3">{label(user.role)}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card-2 text-ink-2" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-2">
          {rest.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              {rest.map((item) => {
                const Icon = ICONS[item.icon];
                const on = active === item.href;
                return (
                  <li key={item.href}>
                    <Link href={item.href} aria-current={on ? "page" : undefined} className={cn(row, on ? "text-accent" : "text-ink")}>
                      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", on ? "bg-accent text-accent-ink" : "bg-card-3 text-ink-2")}>
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.href === "/notifications" && unread > 0 && (
                        <span className="rounded-full bg-[#ef5a3c] px-2 py-0.5 text-[11px] font-bold text-white">{unread}</span>
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            <li>
              <Link href="/account" className={cn(row, "text-ink")}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-card-3 text-ink-2">
                  <KeyRound className="h-4.5 w-4.5" />
                </span>
                <span className="flex-1">Account & password</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
              </Link>
            </li>
            <li>
              <form action={logoutAction}>
                <button type="submit" className={cn(row, "w-full text-bad")}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-bad-lo">
                    <LogOut className="h-4.5 w-4.5" />
                  </span>
                  Sign out
                </button>
              </form>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
