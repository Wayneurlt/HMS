import { BedDouble, DoorOpen, History, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireStudentSelf } from "@/lib/auth/guards";
import { addDays, diffDays, formatDate, today } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { Card, DetailList, EmptyState, PageHeader, StatCard, Table, TD, TH, THead } from "@/components/ui/primitives";
import { getMyStudent } from "../_data";

export const metadata = { title: "My room" };

export default async function MyRoomPage() {
  const user = await requireStudentSelf();
  const student = await getMyStudent(user.studentId);
  const stay = student.activeAccommodation;

  const [roommates, pastStays] = await Promise.all([
    // COUNT only — never names of other students.
    stay
      ? db.accommodation.count({
          where: { isActive: true, bed: { roomId: stay.bed.room.id }, studentId: { not: user.studentId } },
        })
      : Promise.resolve(0),
    db.accommodation.findMany({
      where: { studentId: user.studentId, isActive: false },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        bed: { select: { label: true, room: { select: { name: true } } } },
      },
    }),
  ]);

  return (
    <div>
      <PageHeader title="My room" description="Your current room and bed, and where you have stayed before." />

      {stay ? (
        <div className="grid gap-5 @4xl:grid-cols-3">
          <Card title="Current stay" className="@4xl:col-span-2">
            <div className="mb-5 flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-lo text-accent-hi">
                <DoorOpen className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xl font-semibold text-ink">{stay.bed.room.name}</p>
                <p className="text-sm text-ink-2">{stay.bed.label}</p>
              </div>
            </div>
            <DetailList
              items={[
                { label: "Room", value: stay.bed.room.name },
                { label: "Bed", value: stay.bed.label },
                { label: "Floor", value: stay.bed.room.floor ?? "—" },
                { label: "Moved in", value: formatDate(stay.startDate) },
                { label: "Monthly rent", value: formatMoney(stay.monthlyRent) },
                { label: "Rent due", value: `Day ${student.rentDueDay} of each month` },
              ]}
            />
          </Card>
          <div className="grid gap-3">
            <StatCard
              label="Roommates"
              value={roommates}
              hint={roommates === 0 ? "You have the room to yourself" : `Other occupied bed${roommates === 1 ? "" : "s"} in your room`}
              icon={<Users className="h-3.5 w-3.5" />}
              tone="accent"
            />
            <StatCard
              label="Nights here"
              value={Math.max(0, diffDays(stay.startDate, addDays(today(), 1)))}
              hint={`Since ${formatDate(stay.startDate)}`}
              icon={<BedDouble className="h-3.5 w-3.5" />}
              tone="info"
            />
          </div>
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<BedDouble className="h-5 w-5" />}
            title="No bed assigned"
            description="You don't have an active room. Contact the hostel office if this looks wrong."
          />
        </Card>
      )}

      <div className="mt-5">
        <Card title="Past stays" action={<History className="h-4 w-4 text-ink-3" />}>
          {pastStays.length === 0 ? (
            <EmptyState icon={<History className="h-5 w-5" />} title="No past stays" description="Previous rooms and bed changes will show here." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Room · Bed</TH>
                  <TH>From</TH>
                  <TH>To</TH>
                  <TH align="right">Nights</TH>
                </tr>
              </THead>
              <tbody>
                {pastStays.map((p) => (
                  <tr key={p.id}>
                    <TD>
                      {p.bed.room.name} · {p.bed.label}
                    </TD>
                    <TD>{formatDate(p.startDate)}</TD>
                    <TD>{formatDate(p.endDate)}</TD>
                    <TD align="right">{p.endDate ? Math.max(0, diffDays(p.startDate, p.endDate)) : "—"}</TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
