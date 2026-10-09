import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/primitives";

export const filterControlClass =
  "h-9 w-full rounded-xl border border-line-2 bg-card-2 px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";

/** GET filter form: labelled controls that wrap on small screens, plus Apply / Reset. */
export function FilterBar({ children, resetHref, hidden }: { children: ReactNode; resetHref: string; hidden?: Record<string, string | undefined> }) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
      {hidden &&
        Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {children}
      <div className="flex gap-2">
        <button type="submit" className={buttonClass("secondary", "sm", "h-9")}>
          Apply
        </button>
        <Link href={resetHref} className={buttonClass("ghost", "sm", "h-9")}>
          Reset
        </Link>
      </div>
    </form>
  );
}

export function FilterField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className ?? "w-full min-w-[9rem] flex-1 sm:w-auto sm:flex-none"}>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-3">{label}</span>
      {children}
    </label>
  );
}
