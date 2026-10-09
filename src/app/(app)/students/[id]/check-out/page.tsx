import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, today, toISODate } from "@/lib/dates";
import { formatMoney, label } from "@/lib/format";
import { studentOutstanding } from "@/lib/services/rent";
import { Avatar, Callout, Card, DetailList, LinkButton, PageHeader } from "@/components/ui/primitives";
import { CheckOutForm } from "./check-out-form";

export const metadata = { title: "Check out" };

export default async function CheckOutPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("students.manage");
  const { id } = await params;
  const s = await db.student.findUnique({
    where: { id },
    include: {
      activeAccommodation: { include: { bed: { include: { room: { select: { name: true } } } } } },
      rentPayments: { where: { voidedAt: null }, orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }], take: 1 },
    },
  });
  if (!s || s.deletedAt) notFound();
  const stay = s.activeAccommodation;
  if (!stay) redirect(`/students/${s.id}`);

  const outstanding = await studentOutstanding(s.id);
  const last = s.rentPayments[0];
  const now = today();
  const defaultDate = now.getTime() < stay.startDate.getTime() ? stay.startDate : now;

  return (
    <div>
      <PageHeader
        title="Check out"
        description="Close the student's stay and release the bed."
        actions={
          <LinkButton href={`/students/${s.id}`} variant="ghost">
            <ArrowLeft className="h-4 w-4" /> Profile
          </LinkButton>
        }
      />
      <div className="grid items-start gap-5 @5xl:grid-cols-2">
        <div className="space-y-5">
        <Card>
          <div className="mb-5 flex items-center gap-3">
            <Avatar name={s.fullName} size={44} />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-ink">{s.fullName}</p>
              <p className="text-sm text-ink-2">
                {stay.bed.room.name} · {stay.bed.label}
              </p>
            </div>
          </div>
          <DetailList
            items={[
              { label: "Move-in date", value: formatDate(stay.startDate) },
              { label: "Monthly rent", value: formatMoney(stay.monthlyRent) },
              {
                label: "Outstanding rent",
                value: <span className={outstanding > 0 ? "font-semibold text-bad" : "text-good"}>{formatMoney(outstanding)}</span>,
              },
              {
                label: "Last payment",
                value: last ? `${formatMoney(last.amount)} on ${formatDate(last.paidAt)} · ${label(last.method)}` : "No payments recorded",
              },
            ]}
          />
        </Card>

        {outstanding > 0 && (
          <Callout tone="bad" title={`${formatMoney(outstanding)} is still outstanding`}>
            You can still check out. The balance stays on the student&apos;s record and can be collected later.
          </Callout>
        )}
        <Callout tone="info" title="What happens at check-out">
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>The bed becomes available and the student is marked Checked out.</li>
            <li>All rent records and payments are kept. The move-out month&apos;s rent stays due.</li>
            <li>Unpaid rent for months after the move-out month is voided automatically.</li>
            <li>Overnight answers from the move-out night on are removed, and the student&apos;s login is disabled.</li>
          </ul>
        </Callout>
        </div>

        <Card title="Move-out details">
          <CheckOutForm
            studentId={s.id}
            studentName={s.fullName}
            defaultDate={toISODate(defaultDate)}
            minDate={toISODate(stay.startDate)}
          />
        </Card>
      </div>
    </div>
  );
}
