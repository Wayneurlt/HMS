"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import type { ActionResult } from "@/lib/action-types";
import { cn } from "@/lib/utils";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./primitives";
import { useToast } from "./toast";

const DialogCloseCtx = createContext<(() => void) | null>(null);

/** Inside a <Dialog>, returns a function that closes it (null outside). */
export function useDialogClose() {
  return useContext(DialogCloseCtx);
}

/**
 * Modal dialog opened by its own trigger button. Content can be any node; an ActionForm
 * inside closes the dialog automatically on success.
 */
export function Dialog({
  trigger,
  triggerVariant = "secondary",
  triggerSize = "md",
  triggerClassName,
  title,
  description,
  children,
  wide,
}: {
  trigger: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerClassName?: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button type="button" className={buttonClass(triggerVariant, triggerSize, triggerClassName)} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
        className={cn(
          "m-auto max-h-[92vh] w-[calc(100%-1.5rem)] overflow-visible rounded-card border border-line-2 bg-card p-0 text-ink shadow-2xl",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        {open && (
          <div className="flex max-h-[92vh] flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">{title}</h2>
                {description && <p className="mt-0.5 text-xs text-ink-2">{description}</p>}
              </div>
              <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "icon", "h-8 w-8")} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5">
              <DialogCloseCtx.Provider value={() => setOpen(false)}>{children}</DialogCloseCtx.Provider>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

/**
 * A button that runs a server action with a fixed payload after confirmation.
 * Optionally asks for a reason (sent as `reason`).
 */
export function ConfirmAction({
  action,
  payload,
  label,
  title,
  message,
  confirmLabel = "Confirm",
  variant = "secondary",
  size = "sm",
  confirmVariant = "primary",
  requireReason,
  className,
}: {
  action: (input: Record<string, unknown>) => Promise<ActionResult<unknown>>;
  payload: Record<string, unknown>;
  label: ReactNode;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  confirmVariant?: ButtonVariant;
  requireReason?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  return (
    <>
      <button type="button" className={buttonClass(variant, size, className)} onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      <dialog
        ref={ref}
        className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-card border border-line-2 bg-card p-5 text-ink shadow-2xl"
      >
        <h2 className="text-base font-semibold">{title}</h2>
        {message && <div className="mt-2 text-sm text-ink-2">{message}</div>}
        {requireReason && (
          <div className="mt-4 space-y-1.5">
            <label className="block text-xs font-medium text-ink-2" htmlFor="confirm-reason">
              {requireReason}
            </label>
            <textarea
              id="confirm-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-line-2 bg-card-2 px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>
        )}
        {error && <p className="mt-3 rounded-lg bg-bad-lo px-3 py-2 text-sm text-bad">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={buttonClass("ghost", "md")} onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || (!!requireReason && reason.trim().length < 3)}
            className={buttonClass(confirmVariant, "md")}
            onClick={() =>
              start(async () => {
                const res = await action({ ...payload, ...(requireReason ? { reason } : {}) });
                if (res.ok) {
                  setError(null);
                  setReason("");
                  ref.current?.close();
                  toast("success", res.message ?? "Done");
                  router.refresh();
                } else {
                  setError(res.error);
                }
              })
            }
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
