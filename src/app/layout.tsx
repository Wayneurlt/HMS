import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { ToastProvider } from "@/components/ui/toast";
import { parseTheme, THEME_COOKIE } from "@/lib/preferences";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Hostel Management", template: "%s · Hostel Management" },
  description: "Hostel operations: residents, rent, meals and kitchen.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f3f7" },
    { media: "(prefers-color-scheme: dark)", color: "#050506" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // An explicit choice wins; without one, CSS follows the OS preference.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" className={inter.variable} data-theme={theme} suppressHydrationWarning>
      <body className="font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
