import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { navFor } from "@/lib/nav";
import { AppShell } from "@/components/shell/app-shell";
import { SIDEBAR_COOKIE } from "@/lib/preferences";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePassword && (await headers()).get("x-pathname") !== "/account") {
    redirect("/account?first=1");
  }
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  return (
    <AppShell
      user={{ name: user.name, email: user.email, phone: user.phone, role: user.role }}
      nav={navFor(user.role)}
      unread={unread}
      sidebarExpanded={(await cookies()).get(SIDEBAR_COOKIE)?.value !== "collapsed"}
    >
      {children}
    </AppShell>
  );
}
