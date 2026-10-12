import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { APP_NAME } from "@/lib/brand";
import { ToastProvider } from "@/components/ui/toast";
import { parseTheme, THEME_COOKIE } from "@/lib/preferences";
import "./globals.css";

// Self-hosted Inter (variable weight). Bundling the file avoids fetching from Google Fonts
// at build/dev time, which stalls compiles when the connection is slow or offline.
const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Hostel operations: residents, rent, meals and kitchen.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#050506" },
  ],
  width: "device-width",
  initialScale: 1,
  // Content (and the bottom tab bar) extends to the very edges of the screen.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // An explicit choice wins; without one, the white brand theme applies.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value) ?? "light";
  return (
    <html lang="en" className={inter.variable} data-theme={theme} suppressHydrationWarning>
      <body className="font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
