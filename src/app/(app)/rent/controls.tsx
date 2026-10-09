"use client";

import { useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/action-types";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

/** `<input type="month">` that updates ?month= in the URL. */
export function MonthPicker({ value, max }: { value: string; max?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <input
      type="month"
      aria-label="Month"
      value={value}
      max={max}
      onChange={(e) => {
        const v = e.target.value;
        if (!/^\d{4}-\d{2}$/.test(v)) return;
        const next = new URLSearchParams(params.toString());
        next.set("month", v);
        router.push(`${pathname}?${next.toString()}`);
      }}
      className="h-10 rounded-full border border-line-2 bg-card-2 px-4 text-sm text-ink [color-scheme:dark] focus:border-accent focus:outline-none"
    />
  );
}

/** One-click button that runs a server action with a fixed payload and toasts the result. */
export function ActionButton({
  action,
  payload,
  children,
  variant = "secondary",
  size = "sm",
  className,
  title,
}: {
  action: (input: Record<string, unknown>) => Promise<ActionResult<unknown>>;
  payload: Record<string, unknown>;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  title?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <button
      type="button"
      title={title}
      disabled={pending}
      className={buttonClass(variant, size, className)}
      onClick={() =>
        start(async () => {
          const res = await action(payload);
          if (res.ok) {
            toast("success", res.message ?? "Done");
            router.refresh();
          } else {
            toast("error", res.error);
          }
        })
      }
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}
