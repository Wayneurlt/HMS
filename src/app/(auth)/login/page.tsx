import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/permissions";
import { getPublicInfo } from "@/lib/services/public-info";
import { SignInScreen } from "../sign-in-screen";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(homePathFor(user.role));
  const info = await getPublicInfo();
  if (info?.needsSetup) redirect("/setup");
  return <SignInScreen info={info} user={null} />;
}
