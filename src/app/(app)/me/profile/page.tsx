import { KeyRound } from "lucide-react";
import { requireStudentSelf } from "@/lib/auth/guards";
import { formatDate } from "@/lib/dates";
import { Avatar, Callout, Card, DetailList, LinkButton, PageHeader } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { getMyStudent } from "../_data";

export const metadata = { title: "My profile" };

/** Show only the last 4 characters of an ID number. */
function maskId(id: string | null): string {
  if (!id) return "—";
  const clean = id.trim();
  if (clean.length <= 4) return "•".repeat(clean.length);
  return `${"•".repeat(Math.min(8, clean.length - 4))} ${clean.slice(-4)}`;
}

export default async function MyProfilePage() {
  const user = await requireStudentSelf();
  const s = await getMyStudent(user.studentId);

  return (
    <div>
      <PageHeader title="My profile" description="Your personal details as recorded by the hostel." />
      <div className="grid items-start gap-5 @5xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <div className="mb-5 flex items-center gap-4">
            <Avatar name={s.fullName} size={52} />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-ink">{s.fullName}</p>
              <div className="mt-1">
                <StatusBadge kind="student" value={s.status} />
              </div>
            </div>
          </div>
          <DetailList
            items={[
              { label: "Full name", value: s.fullName },
              { label: "Phone", value: s.phone },
              { label: "Email", value: s.email ?? "—" },
              { label: "ID number", value: <span className="tabular tracking-wide">{maskId(s.idNumber)}</span> },
              { label: "Status", value: <StatusBadge kind="student" value={s.status} /> },
              { label: "Move-in date", value: formatDate(s.moveInDate) },
            ]}
          />
        </Card>
        <div className="space-y-5">
        <Card title="Emergency contact">
          <DetailList
            items={[
              { label: "Name", value: s.emergencyContactName ?? "—" },
              { label: "Phone", value: s.emergencyContactPhone ?? "—" },
            ]}
          />
        </Card>
        <Callout tone="info" title="Need to change something?">
          To change your details, contact the hostel office.
        </Callout>
        <Card title="Password" subtitle="Manage your sign-in password from your account page.">
          <LinkButton href="/account" variant="secondary">
            <KeyRound className="h-4 w-4" /> Change password
          </LinkButton>
        </Card>
        </div>
      </div>
    </div>
  );
}
