import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate } from "@/lib/dates";
import { formatMoney, toNumber } from "@/lib/format";
import { Avatar, Callout, Card, DetailList, LinkButton, PageHeader } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { EditStudentForm } from "./edit-student-form";

export const metadata = { title: "Edit student" };

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("students.manage");
  const { id } = await params;
  const s = await db.student.findUnique({
    where: { id },
    include: { activeAccommodation: { include: { bed: { include: { room: { select: { name: true } } } } } } },
  });
  if (!s || s.deletedAt) notFound();
  const stay = s.activeAccommodation;

  return (
    <div>
      <PageHeader
        title={`Edit ${s.fullName}`}
        actions={
          <LinkButton href={`/students/${s.id}`} variant="ghost">
            <ArrowLeft className="h-4 w-4" /> Profile
          </LinkButton>
        }
      />
      <div className="grid items-start gap-5 @5xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <EditStudentForm
          id={s.id}
          initial={{
            fullName: s.fullName,
            phone: s.phone,
            email: s.email ?? "",
            emergencyContactName: s.emergencyContactName ?? "",
            emergencyContactPhone: s.emergencyContactPhone ?? "",
            idNumber: s.idNumber ?? "",
            notes: s.notes ?? "",
          }}
          monthlyRent={toNumber(s.monthlyRent)}
          rentDueDay={s.rentDueDay}
          hasStay={!!stay}
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
                { label: "Room · bed", value: stay ? `${stay.bed.room.name} · ${stay.bed.label}` : "Not checked in" },
                { label: "Moved in", value: stay ? formatDate(stay.startDate) : "—" },
                { label: "Current monthly rent", value: formatMoney(s.monthlyRent) },
                { label: "Rent due", value: `Day ${s.rentDueDay} of each month` },
              ]}
            />
          </Card>
          <Callout tone="info" title="Changing the rent">
            A new monthly rent or due day applies to rent records created from now on. Existing records keep their amounts; the
            owner can adjust a specific month from the Rent page.
          </Callout>
        </div>
      </div>
    </div>
  );
}
