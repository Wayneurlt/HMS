import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { addDays, toISODate } from "@/lib/dates";
import { AnnouncementCard } from "@/components/announcement-card";
import { ConfirmAction, Dialog } from "@/components/ui/dialog";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { deleteAnnouncement } from "./actions";
import { AnnouncementForm } from "./announcement-form";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  await requirePermission("announcements.manage");
  const now = new Date();
  const all = await db.announcement.findMany({
    where: { deletedAt: null },
    orderBy: { publishAt: "desc" },
    take: 100,
    include: { createdBy: { select: { name: true } } },
  });
  const active = all.filter((a) => !a.expiresAt || a.expiresAt > now);
  const expired = all.filter((a) => a.expiresAt && a.expiresAt <= now);

  const actionsFor = (a: (typeof all)[number]) => (
    <>
      <Dialog trigger={<Pencil className="h-4 w-4" />} triggerVariant="ghost" triggerSize="icon" triggerClassName="h-8 w-8" title="Edit announcement">
        <AnnouncementForm
          initial={{
            id: a.id,
            title: a.title,
            message: a.message,
            priority: a.priority,
            audience: a.audience,
            expiresOn: a.expiresAt ? toISODate(addDays(a.expiresAt, -1)) : "",
          }}
        />
      </Dialog>
      <ConfirmAction
        action={deleteAnnouncement}
        payload={{ id: a.id }}
        label={<Trash2 className="h-4 w-4" />}
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Remove announcement?"
        message={`"${a.title}" will no longer be shown to anyone.`}
        confirmLabel="Remove"
        confirmVariant="danger"
      />
    </>
  );

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Notices shown to students and staff. Publishing also sends an in-app notification."
        actions={
          <Dialog trigger={<><Plus className="h-4 w-4" /> New announcement</>} triggerVariant="primary" title="New announcement">
            <AnnouncementForm />
          </Dialog>
        }
      />
      <div className="grid gap-5 @6xl:grid-cols-3">
        <Card title="Active" subtitle={`${active.length} visible now`} className="@6xl:col-span-2">
          {active.length === 0 ? (
            <EmptyState icon={<Megaphone className="h-5 w-5" />} title="No active announcements" description="Post a notice about water outages, cleaning schedules, meetings or rules." />
          ) : (
            <div className="space-y-3">
              {active.map((a) => (
                <AnnouncementCard key={a.id} a={a} actions={actionsFor(a)} />
              ))}
            </div>
          )}
        </Card>
        <Card title="Expired" subtitle="Kept for reference">
          {expired.length === 0 ? (
            <p className="text-sm text-ink-3">Nothing here yet.</p>
          ) : (
            <div className="space-y-3 opacity-80">
              {expired.map((a) => (
                <AnnouncementCard key={a.id} a={a} actions={actionsFor(a)} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
