"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, Loader2 } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

function useRun() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (fn: () => ReturnType<typeof markAllNotificationsRead>, quiet = false) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        if (!quiet) toast("success", res.message ?? "Done");
        router.refresh();
      } else {
        toast("error", res.error);
      }
    });
  return { pending, run };
}

export function MarkReadButton({ id }: { id: string }) {
  const { pending, run } = useRun();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => markNotificationRead({ id }), true)}
      className={buttonClass("ghost", "sm")}
      aria-label="Mark as read"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">Mark read</span>
    </button>
  );
}

export function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
  const { pending, run } = useRun();
  return (
    <button
      type="button"
      disabled={pending || disabled}
      onClick={() => run(() => markAllNotificationsRead({}))}
      className={buttonClass("secondary", "md")}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
      Mark all read
    </button>
  );
}
