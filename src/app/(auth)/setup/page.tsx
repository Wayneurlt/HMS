import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AuthCard } from "../auth-card";
import { SetupForm } from "./setup-form";

export const metadata = { title: "First-time setup" };
export const dynamic = "force-dynamic";

/** Available only until the first OWNER account exists. */
export default async function SetupPage() {
  const owners = await db.user.count({ where: { role: "OWNER" } });
  if (owners > 0) redirect("/login");
  return (
    <AuthCard title="Set up your hostel" subtitle="Create the owner account. This page disappears once an owner exists.">
      <SetupForm />
    </AuthCard>
  );
}
