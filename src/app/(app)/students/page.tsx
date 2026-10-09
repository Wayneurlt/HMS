import Link from "next/link";
import type { Prisma, StudentStatus } from "@prisma/client";
import { Plus, Search, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { outstandingByStudent } from "@/lib/services/rent";
import { Avatar, Card, EmptyState, FilterTabs, LinkButton, PageHeader, Table, TD, TH, THead } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";

export const metadata = { title: "Students" };

const STATUS_TABS: { value: string; label: string; status?: StudentStatus }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active", status: "ACTIVE" },
  { value: "pending", label: "Pending", status: "PENDING" },
  { value: "suspended", label: "Suspended", status: "SUSPENDED" },
  { value: "checked-out", label: "Checked out", status: "CHECKED_OUT" },
];

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requirePermission("students.view");
  const canManage = can(user.role, "students.manage");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const tab = STATUS_TABS.find((t) => t.value === sp.status) ?? STATUS_TABS[0]!;

  const search: Prisma.StudentWhereInput = q
    ? {
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q.replace(/[\s-]/g, "") } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const base: Prisma.StudentWhereInput = { deletedAt: null, ...search };

  const [students, counts, outstanding] = await Promise.all([
    db.student.findMany({
      where: { ...base, ...(tab.status ? { status: tab.status } : {}) },
      orderBy: [{ fullName: "asc" }],
      take: 500,
      include: { activeAccommodation: { include: { bed: { include: { room: { select: { name: true } } } } } } },
    }),
    db.student.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    outstandingByStudent(),
  ]);
  const countOf = (s?: StudentStatus) =>
    s ? (counts.find((c) => c.status === s)?._count._all ?? 0) : counts.reduce((a, c) => a + c._count._all, 0);

  const href = (status: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    const s = p.toString();
    return s ? `/students?${s}` : "/students";
  };

  return (
    <div>
      <PageHeader
        title="Students"
        description="Everyone who lives here, has lived here, or is waiting for a bed."
        actions={
          canManage && (
            <LinkButton href="/students/new" variant="primary">
              <Plus className="h-4 w-4" /> Add student
            </LinkButton>
          )
        }
      />

      <Card>
        <div className="mb-4 flex flex-col gap-3 @2xl:flex-row @2xl:items-center @2xl:justify-between">
          <FilterTabs
            active={tab.value}
            tabs={STATUS_TABS.map((t) => ({ value: t.value, label: t.label, href: href(t.value), count: countOf(t.status) }))}
          />
          <form action="/students" className="relative w-full @2xl:w-72">
            {tab.value !== "all" && <input type="hidden" name="status" value={tab.value} />}
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search name, phone or email"
              aria-label="Search students"
              className="h-9 w-full rounded-full border border-line-2 bg-card-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
          </form>
        </div>

        {students.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title={q ? `No students match “${q}”` : "No students here yet"}
            description={q ? "Try a different name, phone or email." : "Add a student to check them in to a bed."}
            action={
              canManage && !q && (
                <LinkButton href="/students/new" variant="primary" size="sm">
                  <Plus className="h-4 w-4" /> Add student
                </LinkButton>
              )
            }
          />
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <ul className="space-y-2 @2xl:hidden">
              {students.map((s) => {
                const owed = outstanding.get(s.id) ?? 0;
                const bed = s.activeAccommodation?.bed;
                return (
                  <li key={s.id}>
                    <Link href={`/students/${s.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-card-2 p-3">
                      <Avatar name={s.fullName} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-ink">{s.fullName}</span>
                          <StatusBadge kind="student" value={s.status} />
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-ink-3">
                          <span className="truncate">{bed ? `${bed.room.name} · ${bed.label}` : s.phone}</span>
                          <span className={owed > 0 ? "tabular font-medium text-bad" : "tabular"}>{formatMoney(owed)}</span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Desktop: table */}
            <div className="hidden @2xl:block">
              <Table>
                <THead>
                  <tr>
                    <TH>Student</TH>
                    <TH>Phone</TH>
                    <TH>Room · Bed</TH>
                    <TH align="right">Monthly rent</TH>
                    <TH align="right">Outstanding</TH>
                    <TH>Status</TH>
                    <TH>Move-in</TH>
                  </tr>
                </THead>
                <tbody>
                  {students.map((s) => {
                    const owed = outstanding.get(s.id) ?? 0;
                    const bed = s.activeAccommodation?.bed;
                    return (
                      <tr key={s.id} className="hover:bg-card-2/50">
                        <TD>
                          <Link href={`/students/${s.id}`} className="flex items-center gap-3 hover:text-accent-hi">
                            <Avatar name={s.fullName} size={32} />
                            <span className="font-medium">{s.fullName}</span>
                          </Link>
                        </TD>
                        <TD className="text-ink-2">{s.phone}</TD>
                        <TD className="text-ink-2">{bed ? `${bed.room.name} · ${bed.label}` : "—"}</TD>
                        <TD align="right">{formatMoney(s.monthlyRent)}</TD>
                        <TD align="right" className={owed > 0 ? "font-medium text-bad" : "text-ink-2"}>
                          {formatMoney(owed)}
                        </TD>
                        <TD>
                          <StatusBadge kind="student" value={s.status} />
                        </TD>
                        <TD className="text-ink-2">{formatDate(s.moveInDate)}</TD>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
