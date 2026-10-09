import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRightLeft,
  BedSingle,
  CirclePause,
  CirclePlay,
  KeyRound,
  LogIn,
  LogOut,
  Pencil,
  UserPlus,
} from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { addDays, formatDate, formatDateTime, formatDayShort, formatMonth, today, toISODate } from "@/lib/dates";
import { formatMoney, label, round2, toNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { studentOutstanding } from "@/lib/services/rent";
import { ConfirmAction, Dialog } from "@/components/ui/dialog";
import {
  Avatar,
  Badge,
  Card,
  DetailList,
  EmptyState,
  LinkButton,
  StatCard,
  Table,
  TD,
  TH,
  THead,
} from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { setStudentStatus } from "../actions";
import { availableBedOptions } from "../queries";
import { ChangeBedForm, CreateLoginForm, ResetPasswordForm } from "./profile-forms";

export const metadata = { title: "Student" };

export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("students.view");
  const canManage = can(user.role, "students.manage");
  const canRent = can(user.role, "rent.view");
  const { id } = await params;
  const now = today();

  const student = await db.student.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, phone: true, isActive: true, lastLoginAt: true, mustChangePassword: true } },
      activeAccommodation: { include: { bed: { include: { room: { select: { name: true } } } } } },
      accommodations: {
        orderBy: { startDate: "desc" },
        include: {
          bed: { include: { room: { select: { name: true } } } },
          checkedInBy: { select: { name: true } },
          checkedOutBy: { select: { name: true } },
        },
      },
      rentInvoices: { orderBy: { periodMonth: "desc" }, take: 36 },
      rentPayments: {
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        take: 50,
        include: { recordedBy: { select: { name: true } }, invoice: { select: { periodMonth: true } } },
      },
      overnightStatuses: { where: { date: { gte: addDays(now, -13) } }, orderBy: { date: "desc" } },
    },
  });
  if (!student) notFound();

  const outstanding = await studentOutstanding(student.id);
  const stay = student.activeAccommodation;
  const lastPayment = student.rentPayments.find((p) => !p.voidedAt);
  const paidTotal = round2(student.rentPayments.filter((p) => !p.voidedAt).reduce((a, p) => a + toNumber(p.amount), 0));
  const canCheckIn = !stay && !student.deletedAt && (student.status === "PENDING" || student.status === "CHECKED_OUT");
  const beds = canManage && stay ? await availableBedOptions() : [];
  const loginName = student.user ? (student.user.email ?? student.user.phone ?? "") : "";

  return (
    <div>
      <div className="mb-4">
        <LinkButton href="/students" variant="ghost" size="sm" className="-ml-3">
          <ArrowLeft className="h-4 w-4" /> Students
        </LinkButton>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 @4xl:flex-row @4xl:items-center @4xl:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={student.fullName} size={56} className="text-base" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{student.fullName}</h1>
              <StatusBadge kind="student" value={student.status} />
            </div>
            <p className="mt-1 text-sm text-ink-2">
              {stay ? `${stay.bed.room.name} · ${stay.bed.label}` : "No bed"} · {student.phone}
            </p>
          </div>
        </div>
        {canManage && !student.deletedAt && (
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href={`/students/${student.id}/edit`} size="sm">
              <Pencil className="h-4 w-4" /> Edit
            </LinkButton>
            {canCheckIn && (
              <LinkButton href={`/students/${student.id}/check-in`} variant="primary" size="sm">
                <LogIn className="h-4 w-4" /> Check in
              </LinkButton>
            )}
            {stay && (
              <Dialog
                trigger={<><ArrowRightLeft className="h-4 w-4" /> Change bed</>}
                triggerSize="sm"
                title="Change bed"
                description={student.fullName}
              >
                <ChangeBedForm
                  studentId={student.id}
                  current={`${stay.bed.room.name} · ${stay.bed.label}`}
                  beds={beds}
                  defaultDate={toISODate(now.getTime() < stay.startDate.getTime() ? stay.startDate : now)}
                  minDate={toISODate(stay.startDate)}
                />
              </Dialog>
            )}
            {student.status === "ACTIVE" && (
              <ConfirmAction
                action={setStudentStatus}
                payload={{ id: student.id, status: "SUSPENDED" }}
                label={<><CirclePause className="h-4 w-4" /> Suspend</>}
                title={`Suspend ${student.fullName}?`}
                message="The student keeps their bed and rent continues. Use this for disciplinary or administrative holds."
                confirmLabel="Suspend"
                confirmVariant="danger"
              />
            )}
            {student.status === "SUSPENDED" && (
              <ConfirmAction
                action={setStudentStatus}
                payload={{ id: student.id, status: "ACTIVE" }}
                label={<><CirclePlay className="h-4 w-4" /> Reactivate</>}
                title={`Reactivate ${student.fullName}?`}
                message="The student's status returns to Active."
                confirmLabel="Reactivate"
              />
            )}
            {student.user ? (
              <Dialog trigger={<><KeyRound className="h-4 w-4" /> Reset login password</>} triggerSize="sm" title="Reset login password">
                <ResetPasswordForm studentId={student.id} login={loginName} />
              </Dialog>
            ) : (
              <Dialog trigger={<><UserPlus className="h-4 w-4" /> Create login</>} triggerSize="sm" title="Create student login">
                <CreateLoginForm studentId={student.id} suggestion={student.email ?? student.phone} />
              </Dialog>
            )}
            {stay && (
              <LinkButton href={`/students/${student.id}/check-out`} variant="danger" size="sm">
                <LogOut className="h-4 w-4" /> Check out
              </LinkButton>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-5 @6xl:grid-cols-3">
        <div className="space-y-5 @6xl:col-span-2">
          {/* Rent summary */}
          <div className="grid grid-cols-1 gap-3 @xl:grid-cols-3">
            <StatCard
              label="Outstanding rent"
              value={<span className={outstanding > 0 ? "text-bad" : undefined}>{formatMoney(outstanding)}</span>}
              hint={outstanding > 0 ? "Across all unpaid months" : "All settled"}
              href={canRent ? `/rent?student=${student.id}` : undefined}
            />
            <StatCard
              label="Last payment"
              value={lastPayment ? formatMoney(lastPayment.amount) : "—"}
              hint={lastPayment ? `${formatDate(lastPayment.paidAt)} · ${label(lastPayment.method)}` : "No payments yet"}
            />
            <StatCard label="Total paid" value={formatMoney(paidTotal)} hint="All non-voided payments" />
          </div>

          <Card
            title="Rent records"
            subtitle="One invoice per month"
            action={
              canRent && (
                <LinkButton href={`/rent?student=${student.id}`} size="sm" variant="ghost">
                  Open in Rent
                </LinkButton>
              )
            }
          >
            {student.rentInvoices.length === 0 ? (
              <EmptyState title="No rent records" description="Rent is generated when the student is checked in." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Month</TH>
                    <TH align="right">Due</TH>
                    <TH align="right">Paid</TH>
                    <TH align="right">Outstanding</TH>
                    <TH>Status</TH>
                    <TH>Due date</TH>
                  </tr>
                </THead>
                <tbody>
                  {student.rentInvoices.map((inv) => {
                    const owed = round2(toNumber(inv.amountDue) - toNumber(inv.amountPaid));
                    const voided = !!inv.voidedAt;
                    return (
                      <tr key={inv.id} className={cn(voided && "opacity-50")}>
                        <TD>
                          {canRent ? (
                            <Link href={`/rent/${inv.id}`} className={cn("font-medium hover:text-accent-hi", voided && "line-through")}>
                              {formatMonth(inv.periodMonth, "long")}
                            </Link>
                          ) : (
                            <span className={cn("font-medium", voided && "line-through")}>{formatMonth(inv.periodMonth, "long")}</span>
                          )}
                        </TD>
                        <TD align="right">{formatMoney(inv.amountDue)}</TD>
                        <TD align="right" className="text-ink-2">{formatMoney(inv.amountPaid)}</TD>
                        <TD align="right" className={!voided && owed > 0 ? "font-medium text-bad" : "text-ink-2"}>
                          {voided ? "—" : formatMoney(owed)}
                        </TD>
                        <TD>{voided ? <Badge>Voided</Badge> : <StatusBadge kind="rent" value={inv.status} />}</TD>
                        <TD className="text-ink-2">{formatDate(inv.dueDate)}</TD>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="Payment history" subtitle="Voided payments are shown struck through">
            {student.rentPayments.length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>For</TH>
                    <TH align="right">Amount</TH>
                    <TH>Method</TH>
                    <TH>Reference</TH>
                    <TH>Recorded by</TH>
                  </tr>
                </THead>
                <tbody>
                  {student.rentPayments.map((p) => {
                    const voided = !!p.voidedAt;
                    return (
                      <tr key={p.id} className={cn(voided && "text-ink-3 line-through opacity-60")}>
                        <TD className="whitespace-nowrap">{formatDate(p.paidAt)}</TD>
                        <TD className="text-ink-2">{formatMonth(p.invoice.periodMonth)}</TD>
                        <TD align="right" className="font-medium">{formatMoney(p.amount)}</TD>
                        <TD className="text-ink-2">{label(p.method)}</TD>
                        <TD className="text-ink-2">{p.reference || "—"}</TD>
                        <TD className="text-ink-2">
                          {p.recordedBy?.name ?? "—"}
                          {voided && <span className="ml-2 no-underline"><Badge tone="bad">Voided</Badge></span>}
                        </TD>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="Accommodation history" subtitle="Every stay, including bed changes">
            {student.accommodations.length === 0 ? (
              <EmptyState icon={<BedSingle className="h-5 w-5" />} title="Never checked in" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Room · Bed</TH>
                    <TH>From</TH>
                    <TH>To</TH>
                    <TH align="right">Monthly rent</TH>
                    <TH>By</TH>
                    <TH>Notes</TH>
                  </tr>
                </THead>
                <tbody>
                  {student.accommodations.map((a) => (
                    <tr key={a.id}>
                      <TD className="font-medium">
                        {a.bed.room.name} · {a.bed.label}
                        {a.isActive && <Badge tone="good" className="ml-2">Current</Badge>}
                      </TD>
                      <TD className="whitespace-nowrap text-ink-2">{formatDate(a.startDate)}</TD>
                      <TD className="whitespace-nowrap text-ink-2">{a.endDate ? formatDate(a.endDate) : "Present"}</TD>
                      <TD align="right">{formatMoney(a.monthlyRent)}</TD>
                      <TD className="text-xs text-ink-2">
                        {a.checkedInBy?.name ?? "—"}
                        {a.checkedOutBy && ` → ${a.checkedOutBy.name}`}
                      </TD>
                      <TD className="max-w-55 truncate text-xs text-ink-2">{a.checkoutNotes || "—"}</TD>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Current accommodation">
            {stay ? (
              <DetailList
                className="@xl:grid-cols-2 @6xl:grid-cols-2"
                items={[
                  { label: "Room", value: stay.bed.room.name },
                  { label: "Bed", value: stay.bed.label },
                  { label: "Since", value: formatDate(stay.startDate) },
                  { label: "Monthly rent", value: formatMoney(stay.monthlyRent) },
                  { label: "Rent due day", value: `Day ${student.rentDueDay}` },
                  { label: "First moved in", value: formatDate(student.moveInDate) },
                ]}
              />
            ) : (
              <div className="space-y-2 text-sm text-ink-2">
                <p>Not in a bed{student.moveOutDate ? `. Moved out ${formatDate(student.moveOutDate)}.` : "."}</p>
                <p className="text-xs text-ink-3">
                  Agreed rent {formatMoney(student.monthlyRent)}, due day {student.rentDueDay}.
                </p>
              </div>
            )}
          </Card>

          <Card title="Personal details">
            <DetailList
              className="@xl:grid-cols-2 @6xl:grid-cols-1"
              items={[
                { label: "Phone", value: student.phone },
                { label: "Email", value: student.email || "—" },
                { label: "ID / passport", value: student.idNumber || "—" },
                {
                  label: "Emergency contact",
                  value:
                    [student.emergencyContactName, student.emergencyContactPhone].filter(Boolean).join(" · ") || "—",
                },
                { label: "Notes", value: student.notes ? <span className="whitespace-pre-line">{student.notes}</span> : "—" },
                {
                  label: "Login",
                  value: student.user ? (
                    <span className="flex flex-wrap items-center gap-2">
                      {loginName}
                      <StatusBadge kind="active" value={student.user.isActive} />
                      {student.user.mustChangePassword && <Badge tone="warn">Temp password</Badge>}
                    </span>
                  ) : (
                    "No login"
                  ),
                },
                ...(student.user ? [{ label: "Last sign-in", value: formatDateTime(student.user.lastLoginAt) }] : []),
                { label: "Added", value: formatDateTime(student.createdAt) },
              ]}
            />
          </Card>

          <Card title="Overnight answers" subtitle="Last 14 days">
            {student.overnightStatuses.length === 0 ? (
              <p className="text-sm text-ink-3">No answers in the last 14 days.</p>
            ) : (
              <ul className="divide-y divide-line">
                {student.overnightStatuses.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="text-ink-2">{formatDayShort(o.date)}</span>
                    <span className="flex min-w-0 items-center gap-2">
                      {o.note && <span className="truncate text-xs text-ink-3">{o.note}</span>}
                      <StatusBadge kind="overnight" value={o.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
