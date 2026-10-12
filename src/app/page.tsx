import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/brand";
import { getPublicInfo } from "@/lib/services/public-info";
import { SignInScreen } from "./(auth)/sign-in-screen";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const name = APP_NAME;
  return {
    title: { absolute: `${name} · Student accommodation` },
    description: `${name}: student accommodation for male students, with breakfast and dinner every day and simple monthly rent.`,
    robots: { index: true, follow: true },
  };
}

export default async function LandingPage() {
  const [user, info] = await Promise.all([getSessionUser(), getPublicInfo()]);
  return <SignInScreen info={info} user={user} />;
}
