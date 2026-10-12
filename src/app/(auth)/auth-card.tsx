import type { ReactNode } from "react";
import { MasqaniLogo } from "@/components/brand/masqani-logo";
import { ThemeToggle } from "@/components/theme-toggle";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="relative grid min-h-dvh place-items-center bg-page px-4 py-10">
      <ThemeToggle className="absolute right-4 top-4 h-11 w-11 border border-line bg-card" />
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <MasqaniLogo className="h-24" />
        </div>
        <div className="rounded-card border border-line bg-card p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
