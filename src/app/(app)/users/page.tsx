import Link from "next/link";
import type { Role } from "@prisma/client";
import { Pencil, UserCheck, UserX, UsersRound } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { can, manageableRoles } from "@/lib/auth/permissions";
import { formatDateTime, timeAgo } from "@/lib/dates";
import { sp } from "@/lib/utils";
import { ConfirmAction, Dialog } from "@/components/ui/dialog";
import { Avatar, Card, EmptyState, FilterTabs, PageHeader, Table, TD, TH, THead } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { setUserActive } from "./actions";
import { CreateUserButton, EditUserForm, ResetPasswordButton } from "./user-forms";

export const metadata = { title: "Users" };

const ROLES: Role[] = ["OWNER", "HOSTEL_MANAGER", "KITCHEN_STAFF", "STUDENT"];
const ROLE_TAB_LABEL: Record<Role, string> = {
  OWNER: "Owners",
  HOSTEL_MANAGER: "Managers",
  KITCHEN_STAFF: "Kitchen",
  STUDENT: "Students",
};

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("users.view");
  const roleParam = sp(await searchParams, "role");
  const roleFilter = ROLES.find((r) => r === roleParam) ?? null;
  const isOwner = can(actor.role, "users.manage");
  const manageable = manageableRoles(actor.role);

  const [users, counts, students] = await Promise.all([
    db.user.findMany({
      where: roleFilter ? { role: roleFilter } : undefined,
      orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
        student: { select: { id: true, fullName: true, status: true } },
      },
    }),
    db.user.groupBy({ by: ["role"], _count: { _all: true } }),
    isOwner
      ? db.student.findMany({
          where: { userId: null, deletedAt: null, status: { not: "CHECKED_OUT" } },
          orderBy: { fullName: "asc" },
          select: { id: true, fullName: true, phone: true, email: true },
        })
      : Promise.resolve([]),
  ]);
  const countFor = (r: Role) => counts.find((c) => c.role === r)?._count._all ?? 0;
  const total = counts.reduce((a, c) => a + c._count._all, 0);

  return (
    <div>
      <PageHeader
        title="Users"
        description={isOwner ? "Staff, owner and student login accounts." : "Login accounts. You can reset passwords and enable or disable student logins."}
        actions={isOwner ? <CreateUserButton students={students} /> : undefined}
      />
      <Card>
        <div className="mb-4">
          <FilterTabs
            active={roleFilter ?? "ALL"}
            tabs={[
              { value: "ALL", label: "All", href: "/users", count: total },
              ...ROLES.map((r) => ({ value: r, label: ROLE_TAB_LABEL[r], href: `/users?role=${r}`, count: countFor(r) })),
            ]}
          />
        </div>
        {users.length === 0 ? (
          <EmptyState icon={<UsersRound className="h-5 w-5" />} title="No users" description="No accounts match this filter." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Contact</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Last login</TH>
                <TH>Student</TH>
                <TH align="right">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === actor.id;
                const canAct = manageable.includes(u.role) && !isSelf;
                return (
                  <tr key={u.id} className={u.isActive ? undefined : "opacity-60"}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} size={32} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {u.name}
                            {isSelf && <span className="ml-1.5 text-xs font-normal text-ink-3">(you)</span>}
                          </p>
                          {u.mustChangePassword && <p className="text-[11px] text-warn">Must change password</p>}
                        </div>
                      </div>
                    </TD>
                    <TD className="text-ink-2">
                      <div className="text-[13px]">{u.email ?? "—"}</div>
                      <div className="text-xs text-ink-3">{u.phone ?? ""}</div>
                    </TD>
                    <TD>
                      <StatusBadge kind="role" value={u.role} />
                    </TD>
                    <TD>
                      <StatusBadge kind="active" value={u.isActive} />
                    </TD>
                    <TD className="whitespace-nowrap text-ink-2">
                      {u.lastLoginAt ? <span title={formatDateTime(u.lastLoginAt)}>{timeAgo(u.lastLoginAt)}</span> : <span className="text-ink-3">Never</span>}
                    </TD>
                    <TD>
                      {u.student ? (
                        <Link href={`/students/${u.student.id}`} className="text-[13px] hover:text-accent-hi">
                          {u.student.fullName}
                        </Link>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </TD>
                    <TD align="right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {isOwner && (
                          <Dialog
                            trigger={<Pencil className="h-4 w-4" />}
                            triggerVariant="ghost"
                            triggerSize="icon"
                            triggerClassName="h-8 w-8"
                            title={`Edit ${u.name}`}
                          >
                            <EditUserForm user={{ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role }} isSelf={isSelf} />
                          </Dialog>
                        )}
                        {canAct && <ResetPasswordButton id={u.id} name={u.name} />}
                        {canAct &&
                          (u.isActive ? (
                            <ConfirmAction
                              action={setUserActive}
                              payload={{ id: u.id, active: false }}
                              label={
                                <>
                                  <UserX className="h-3.5 w-3.5" /> Deactivate
                                </>
                              }
                              variant="ghost"
                              title={`Deactivate ${u.name}?`}
                              message="They will be signed out immediately and cannot sign in until re-activated. Their records are kept."
                              confirmLabel="Deactivate"
                              confirmVariant="danger"
                            />
                          ) : (
                            <ConfirmAction
                              action={setUserActive}
                              payload={{ id: u.id, active: true }}
                              label={
                                <>
                                  <UserCheck className="h-3.5 w-3.5" /> Activate
                                </>
                              }
                              variant="ghost"
                              title={`Activate ${u.name}?`}
                              message="They will be able to sign in again with their current password."
                              confirmLabel="Activate"
                            />
                          ))}
                      </div>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
