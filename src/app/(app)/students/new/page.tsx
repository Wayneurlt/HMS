import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { today, toISODate } from "@/lib/dates";
import { toNumber } from "@/lib/format";
import { getSettings } from "@/lib/services/settings";
import { LinkButton, PageHeader } from "@/components/ui/primitives";
import { availableBedOptions } from "../queries";
import { NewStudentForm } from "./new-student-form";

export const metadata = { title: "Add student" };

export default async function NewStudentPage() {
  await requirePermission("students.manage");
  const [settings, beds] = await Promise.all([getSettings(), availableBedOptions()]);
  return (
    <div>
      <PageHeader
        title="Add student"
        description="Check a new student in: details, bed, move-in date and rent terms, then confirm."
        actions={
          <LinkButton href="/students" variant="ghost">
            <ArrowLeft className="h-4 w-4" /> Students
          </LinkButton>
        }
      />
      <NewStudentForm
        beds={beds}
        defaults={{
          moveInDate: toISODate(today()),
          monthlyRent: toNumber(settings.defaultMonthlyRent),
          rentDueDay: settings.defaultRentDueDay,
        }}
      />
    </div>
  );
}
