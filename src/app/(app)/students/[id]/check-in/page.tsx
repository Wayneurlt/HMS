import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, today, toISODate } from "@/lib/dates";
import { formatMoney, toNumber } from "@/lib/format";
import { Avatar, Callout, Card, DetailList, LinkButton, PageHeader } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { availableBedOptions } from "../../queries";
import { CheckInForm } from "./check-in-form";

export const metadata = { title: "Check in" };

export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("students.manage");
  const { id } = await params;
  const s = await db.student.findUnique({ where: { id }, include: { activeAccommodation: { select: { id: true } } } });
  if (!s || s.deletedAt) notFound();
  if (s.activeAccommodation || (s.status !== "PENDING" && s.status !== "CHECKED_OUT")) redirect(`/students/${s.id}`);

  const beds = await availableBedOptions();
  return (
    <div>
      <PageHeader
        title={`Check in ${s.fullName}`}
        description={
          s.status === "CHECKED_OUT"
            ? `Re-admission. Previously moved out ${formatDate(s.moveOutDate)}.`
            : "Assign a bed and confirm the rent terms."
        }
        actions={
          <LinkButton href={`/students/${s.id}`} variant="ghost">
            <ArrowLeft className="h-4 w-4" /> Profile
          </LinkButton>
        }
      />
      <div className="grid items-start gap-5 @5xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <CheckInForm
          studentId={s.id}
          studentName={s.fullName}
          beds={beds}
          defaults={{ moveInDate: toISODate(today()), monthlyRent: toNumber(s.monthlyRent), rentDueDay: s.rentDueDay }}
        />
        <div className="space-y-5">
          <Card>
            <div className="mb-5 flex items-center gap-3">
              <Avatar name={s.fullName} size={44} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{s.fullName}</p>
                <StatusBadge kind="student" value={s.status} />
              </div>
            </div>
            <DetailList
              className="@xl:grid-cols-1"
              items={[
                { label: "Phone", value: s.phone },
                { label: "Free beds", value: `${beds.length} available` },
                { label: "Last agreed rent", value: formatMoney(s.monthlyRent) },
              ]}
            />
          </Card>
          <Callout tone="info" title="What happens at check-in">
            The bed is marked occupied, the student becomes active and rent is generated from the move-in month.
          </Callout>
        </div>
      </div>
    </div>
  );
}
