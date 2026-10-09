import { requireUser } from "@/lib/auth/guards";
import { label } from "@/lib/format";
import { Callout, Card, DetailList, PageHeader } from "@/components/ui/primitives";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const user = await requireUser();
  const { first } = await searchParams;
  return (
    <div>
      <PageHeader title="Account" description="Your sign-in details and password." />
      {(first || user.mustChangePassword) && (
        <div className="mb-5">
          <Callout tone="warn" title="Please set a new password">
            Your account was created with a temporary password. Choose a new one to continue.
          </Callout>
        </div>
      )}
      <div className="grid gap-5 @2xl:grid-cols-2">
        <Card title="Profile">
          <DetailList
            className="@xl:grid-cols-1"
            items={[
              { label: "Name", value: user.name },
              { label: "Role", value: label(user.role) },
              { label: "Email", value: user.email ?? "—" },
              { label: "Phone", value: user.phone ?? "—" },
            ]}
          />
        </Card>
        <Card title="Change password">
          <ChangePasswordForm />
        </Card>
      </div>
    </div>
  );
}
