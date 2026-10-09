import { ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { homePathFor } from "@/lib/auth/permissions";
import { EmptyState, LinkButton } from "@/components/ui/primitives";

export const metadata = { title: "Access denied" };

export default async function ForbiddenPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-lg pt-16">
      <EmptyState
        icon={<ShieldAlert className="h-5 w-5" />}
        title="You don't have access to this page"
        description="Your role doesn't include this section. If you think this is a mistake, ask the hostel owner."
        action={
          <LinkButton href={homePathFor(user.role)} variant="primary">
            Go to my dashboard
          </LinkButton>
        }
      />
    </div>
  );
}
