import { Megaphone } from "lucide-react";
import { requireStudentSelf } from "@/lib/auth/guards";
import { activeAnnouncements } from "@/lib/services/announcements";
import { AnnouncementCard } from "@/components/announcement-card";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Announcements" };

export default async function MyAnnouncementsPage() {
  await requireStudentSelf();
  const items = await activeAnnouncements("STUDENT");

  return (
    <div>
      <PageHeader title="Announcements" description="Notices from the hostel office." />
      <Card title="Current notices" subtitle={`${items.length} active`}>
        {items.length === 0 ? (
          <EmptyState icon={<Megaphone className="h-5 w-5" />} title="No announcements right now" description="New notices from the hostel will appear here." />
        ) : (
          <div className="grid gap-3 @4xl:grid-cols-2 @[100rem]:grid-cols-3">
            {items.map((a) => (
              <AnnouncementCard key={a.id} a={a} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
