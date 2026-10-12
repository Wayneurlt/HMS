import Link from "next/link";
import { BellRing } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { HOSTEL_TZ, formatDateTime } from "@/lib/dates";
import { CURRENCY, toNumber } from "@/lib/format";
import { getSettings } from "@/lib/services/settings";
import { Badge, Card, DetailList, LinkButton, PageHeader } from "@/components/ui/primitives";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePermission("settings.manage");
  const s = await getSettings();
  // Only the provider NAME is shown — never any credentials.
  const provider = process.env.MESSAGING_PROVIDER?.trim().toLowerCase() || null;
  const cronConfigured = Boolean(process.env.CRON_SECRET?.trim());

  return (
    <div>
      <PageHeader title="Settings" description="Hostel details and defaults used across the system." />
      <div className="grid gap-5 @6xl:grid-cols-3">
        <Card title="Hostel settings" subtitle={`Last updated ${formatDateTime(s.updatedAt)}`} className="@6xl:col-span-2">
          <SettingsForm
            initial={{
              address: s.address ?? "",
              phone: s.phone ?? "",
              email: s.email ?? "",
              defaultMonthlyRent: toNumber(s.defaultMonthlyRent),
              defaultRentDueDay: s.defaultRentDueDay,
              prorateFirstMonth: s.prorateFirstMonth,
              breakfastTime: s.breakfastTime,
              dinnerTime: s.dinnerTime,
            }}
          />
        </Card>
        <div className="space-y-5">
          <Card title="System" subtitle="Configured by the server environment">
            <DetailList
              className="@xl:grid-cols-1"
              items={[
                { label: "Timezone", value: HOSTEL_TZ },
                { label: "Currency", value: CURRENCY },
                {
                  label: "Messaging provider",
                  value: provider ? (
                    <Badge tone="good" dot>
                      {provider}
                    </Badge>
                  ) : (
                    <span className="text-ink-2">
                      Not configured — reminders are delivered in-app only
                    </span>
                  ),
                },
                {
                  label: "Cron secret",
                  value: cronConfigured ? (
                    <Badge tone="good" dot>
                      Configured
                    </Badge>
                  ) : (
                    <span className="text-ink-2">Not set — daily jobs run when staff open the dashboard</span>
                  ),
                },
              ]}
            />
          </Card>
          <Card title="Rent reminders" subtitle="When and how students are reminded about rent">
            <p className="text-sm text-ink-2">The reminder schedule (days before / after the due date and message templates) is managed on its own page.</p>
            <div className="mt-4">
              <LinkButton href="/rent/reminders" size="sm">
                <BellRing className="h-3.5 w-3.5" /> Reminder schedule
              </LinkButton>
            </div>
          </Card>
          <Card title="Accounts">
            <p className="text-sm text-ink-2">
              Manage staff and student logins on the{" "}
              <Link href="/users" className="text-accent-hi hover:underline">
                Users
              </Link>{" "}
              page, and review changes in the{" "}
              <Link href="/activity" className="text-accent-hi hover:underline">
                Activity log
              </Link>
              .
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
