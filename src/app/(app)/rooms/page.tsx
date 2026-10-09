import Link from "next/link";
import { BedDouble, BedSingle, Bookmark, DoorOpen, Pencil, Plus, Power, Trash2, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConfirmAction, Dialog } from "@/components/ui/dialog";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, StatCard } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { deleteBed, deleteRoom, setRoomActive } from "./actions";
import { AddBedsForm, BedForm, RoomForm } from "./room-forms";

export const metadata = { title: "Rooms & Beds" };

function nextBedLabel(labels: string[]): string {
  const nums = labels.map((l) => Number(/(\d+)\s*$/.exec(l)?.[1] ?? 0));
  return `Bed ${Math.max(0, ...nums) + 1}`;
}

export default async function RoomsPage() {
  const user = await requirePermission("rooms.view");
  const canManage = can(user.role, "rooms.manage");

  const rooms = await db.room.findMany({
    where: { deletedAt: null },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      beds: {
        where: { deletedAt: null },
        orderBy: { label: "asc" },
        include: {
          activeAccommodation: { select: { startDate: true, student: { select: { id: true, fullName: true } } } },
        },
      },
    },
  });
  // Natural sort so "Bed 10" follows "Bed 9".
  const collator = new Intl.Collator("en", { numeric: true });
  rooms.sort((a, b) => Number(b.isActive) - Number(a.isActive) || collator.compare(a.name, b.name));
  for (const r of rooms) r.beds.sort((a, b) => collator.compare(a.label, b.label));

  const activeBeds = rooms.filter((r) => r.isActive).flatMap((r) => r.beds);
  const total = activeBeds.length;
  const occupied = activeBeds.filter((b) => b.activeAccommodation).length;
  const vacant = activeBeds.filter((b) => !b.activeAccommodation && b.status === "AVAILABLE").length;
  const reserved = activeBeds.filter((b) => !b.activeAccommodation && b.status === "RESERVED").length;
  const maintenance = activeBeds.filter((b) => !b.activeAccommodation && b.status === "MAINTENANCE").length;
  const rate = total ? (occupied / total) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Rooms & Beds"
        description="Live occupancy of every bed. Beds become occupied through check-in and are released at check-out."
        actions={
          canManage && (
            <Dialog trigger={<><Plus className="h-4 w-4" /> New room</>} triggerVariant="primary" title="New room">
              <RoomForm />
            </Dialog>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 @xl:grid-cols-3 @6xl:grid-cols-6">
        <StatCard label="Total beds" value={total} icon={<BedDouble className="h-3.5 w-3.5" />} hint={`${rooms.filter((r) => r.isActive).length} active rooms`} />
        <StatCard label="Occupied" value={occupied} tone="accent" icon={<BedSingle className="h-3.5 w-3.5" />} />
        <StatCard label="Vacant" value={vacant} tone="good" icon={<DoorOpen className="h-3.5 w-3.5" />} hint="Available now" />
        <StatCard label="Reserved" value={reserved} tone="warn" icon={<Bookmark className="h-3.5 w-3.5" />} />
        <StatCard label="Maintenance" value={maintenance} tone="bad" icon={<Wrench className="h-3.5 w-3.5" />} />
        <StatCard
          label="Occupancy rate"
          value={formatPercent(rate)}
          hint={<ProgressBar value={rate} className="mt-1" />}
          className="col-span-2 @xl:col-span-1"
        />
      </div>

      {rooms.length === 0 ? (
        <Card>
          <EmptyState
            icon={<DoorOpen className="h-5 w-5" />}
            title="No rooms yet"
            description="Create your first room, then add its beds."
            action={
              canManage && (
                <Dialog trigger={<><Plus className="h-4 w-4" /> New room</>} triggerVariant="primary" title="New room">
                  <RoomForm />
                </Dialog>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 @4xl:grid-cols-2">
          {rooms.map((room) => {
            const roomOccupied = room.beds.filter((b) => b.activeAccommodation).length;
            return (
              <Card
                key={room.id}
                className={cn(!room.isActive && "opacity-70")}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {room.name}
                    {!room.isActive && <Badge>Inactive</Badge>}
                  </span>
                }
                subtitle={[
                  room.floor,
                  `${roomOccupied}/${room.beds.length} occupied`,
                  room.description,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                action={
                  canManage && (
                    <>
                      <Dialog
                        trigger={<Plus className="h-4 w-4" />}
                        triggerVariant="ghost"
                        triggerSize="icon"
                        triggerClassName="h-8 w-8"
                        title={`Add beds to ${room.name}`}
                      >
                        <AddBedsForm roomId={room.id} suggestion={nextBedLabel(room.beds.map((b) => b.label))} />
                      </Dialog>
                      <Dialog
                        trigger={<Pencil className="h-4 w-4" />}
                        triggerVariant="ghost"
                        triggerSize="icon"
                        triggerClassName="h-8 w-8"
                        title={`Edit ${room.name}`}
                      >
                        <RoomForm
                          initial={{ id: room.id, name: room.name, floor: room.floor ?? "", description: room.description ?? "" }}
                        />
                      </Dialog>
                      <ConfirmAction
                        action={setRoomActive}
                        payload={{ id: room.id, active: room.isActive ? "false" : "true" }}
                        label={<Power className="h-4 w-4" />}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={room.isActive ? `Deactivate ${room.name}?` : `Reactivate ${room.name}?`}
                        message={
                          room.isActive
                            ? "Its beds will not be offered at check-in until it is reactivated. Only possible when no bed is occupied."
                            : "Its beds will be offered at check-in again."
                        }
                        confirmLabel={room.isActive ? "Deactivate" : "Reactivate"}
                      />
                      <ConfirmAction
                        action={deleteRoom}
                        payload={{ id: room.id }}
                        label={<Trash2 className="h-4 w-4" />}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={`Remove ${room.name}?`}
                        message="The room and its beds disappear from the lists. Past stays and rent history are kept. Only possible when no bed is occupied."
                        confirmLabel="Remove"
                        confirmVariant="danger"
                      />
                    </>
                  )
                }
              >
                {room.beds.length === 0 ? (
                  <p className="text-sm text-ink-3">No beds yet.{canManage && " Use + to add beds."}</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
                    {room.beds.map((bed) => {
                      const stay = bed.activeAccommodation;
                      const status = stay ? "OCCUPIED" : bed.status;
                      return (
                        <div
                          key={bed.id}
                          className={cn(
                            "flex min-h-23 flex-col justify-between gap-2 rounded-2xl border p-3",
                            stay ? "border-accent/30 bg-accent-lo" : "border-line bg-card-2",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <BedSingle className="h-4 w-4 shrink-0 text-ink-3" />
                              <span className="truncate text-sm font-medium text-ink">{bed.label}</span>
                            </div>
                            <StatusBadge kind="bed" value={status} />
                          </div>
                          <div className="flex items-end justify-between gap-2">
                            <div className="min-w-0 text-xs">
                              {stay ? (
                                <Link href={`/students/${stay.student.id}`} className="block truncate font-medium text-accent-hi hover:underline">
                                  {stay.student.fullName}
                                </Link>
                              ) : (
                                <span className="text-ink-3">{bed.notes || "Empty"}</span>
                              )}
                            </div>
                            {canManage && (
                              <div className="-mb-1 -mr-1 flex shrink-0">
                                <Dialog
                                  trigger={<Pencil className="h-3.5 w-3.5" />}
                                  triggerVariant="ghost"
                                  triggerSize="icon"
                                  triggerClassName="h-7 w-7"
                                  title={`${room.name} · ${bed.label}`}
                                  description={stay ? `Occupied by ${stay.student.fullName}` : undefined}
                                >
                                  <BedForm
                                    initial={{ id: bed.id, label: bed.label, status: bed.status, notes: bed.notes ?? "", occupied: !!stay }}
                                  />
                                </Dialog>
                                {!stay && (
                                  <ConfirmAction
                                    action={deleteBed}
                                    payload={{ id: bed.id }}
                                    label={<Trash2 className="h-3.5 w-3.5" />}
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title={`Remove ${room.name} · ${bed.label}?`}
                                    message="The bed will no longer be offered at check-in. Past stays in this bed are kept."
                                    confirmLabel="Remove"
                                    confirmVariant="danger"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
