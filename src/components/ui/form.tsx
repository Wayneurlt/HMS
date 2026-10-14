"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/action-types";
import { cn } from "@/lib/utils";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./primitives";
import { useToast } from "./toast";
import { useDialogClose } from "./dialog";

type FormCtx = { errors: Record<string, string[]>; pending: boolean };
const FormContext = createContext<FormCtx>({ errors: {}, pending: false });

export function useFormErrors() {
  return useContext(FormContext);
}

/**
 * Form bound to a server action defined with defineAction().
 * Shows field errors next to <Field name="…"> inputs, toasts the result, closes the parent
 * dialog on success and refreshes server data.
 */
export function ActionForm<R = unknown>({
  action,
  children,
  className,
  onSuccess,
  redirectTo,
  resetOnSuccess = true,
  successMessage,
  confirm,
}: {
  action: (fd: FormData) => Promise<ActionResult<R>>;
  children: ReactNode;
  className?: string;
  onSuccess?: (result: { message?: string; data?: R }) => void;
  /** Navigate here after success (string or function of returned data). */
  redirectTo?: string | ((data: R | undefined) => string);
  resetOnSuccess?: boolean;
  successMessage?: string;
  /** Ask for browser confirmation before submitting. */
  confirm?: string;
}) {
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const closeDialog = useDialogClose();
  const ref = useRef<HTMLFormElement>(null);

  return (
    <FormContext.Provider value={{ errors, pending }}>
      <form
        ref={ref}
        className={cn("space-y-5", className)}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          if (confirm && !window.confirm(confirm)) return;
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const res = await action(fd);
            if (res.ok) {
              setErrors({});
              setFormError(null);
              toast("success", res.message ?? successMessage ?? "Saved");
              if (resetOnSuccess) ref.current?.reset();
              onSuccess?.({ message: res.message, data: res.data });
              closeDialog?.();
              if (redirectTo) {
                router.push(typeof redirectTo === "function" ? redirectTo(res.data) : redirectTo);
              }
              router.refresh();
            } else {
              setErrors(res.fieldErrors ?? {});
              setFormError(res.error);
              toast("error", res.error);
            }
          });
        }}
      >
        {formError && (
          <div role="alert" className="rounded-xl bg-bad-lo px-4 py-3 text-sm text-bad">
            {formError}
          </div>
        )}
        {/* Real block (not display:contents) so the gap applies between every field and the buttons. */}
        <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
          {children}
        </fieldset>
      </form>
    </FormContext.Provider>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const { pending } = useFormErrors();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant, size, className)}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center justify-end gap-3 pt-1", className)}>{children}</div>;
}

const controlClass =
  "w-full rounded-xl border border-line-2 bg-card-2 px-3.5 text-sm text-ink placeholder:text-ink-3 " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60 " +
  "aria-[invalid=true]:border-bad/70";

/** Label + control + error/hint. `name` links the control to server-side field errors. */
export function Field({
  label,
  name,
  hint,
  children,
  className,
  required,
}: {
  label: string;
  name: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  const { errors } = useFormErrors();
  const err = errors[name]?.[0];
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={name} className="block text-[13px] font-medium leading-none text-ink-2">
        {label}
        {required && <span className="text-bad"> *</span>}
      </label>
      {children}
      {err ? (
        <p className="text-xs leading-snug text-bad" role="alert">
          {err}
        </p>
      ) : hint ? (
        <p className="text-xs leading-snug text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, name, ...props }: ComponentProps<"input"> & { name: string }) {
  const { errors } = useFormErrors();
  return (
    <input
      id={props.id ?? name}
      name={name}
      aria-invalid={errors[name] ? true : undefined}
      className={cn(controlClass, "h-11", className)}
      {...props}
    />
  );
}

export function Textarea({ className, name, rows = 3, ...props }: ComponentProps<"textarea"> & { name: string }) {
  const { errors } = useFormErrors();
  return (
    <textarea
      id={props.id ?? name}
      name={name}
      rows={rows}
      aria-invalid={errors[name] ? true : undefined}
      className={cn(controlClass, "py-2.5", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  name,
  options,
  placeholder,
  ...props
}: Omit<ComponentProps<"select">, "children"> & {
  name: string;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}) {
  const { errors } = useFormErrors();
  return (
    <select
      id={props.id ?? name}
      name={name}
      aria-invalid={errors[name] ? true : undefined}
      className={cn(controlClass, "h-11 appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a3a3b0' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ name, label, defaultChecked, value }: { name: string; label: ReactNode; defaultChecked?: boolean; value?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-line-2 bg-card-2 accent-(--color-accent)"
      />
      {label}
    </label>
  );
}

/** Grid helper for forms. */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  return (
    <div className={cn("grid grid-cols-1 gap-x-4 gap-y-5", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3")}>
      {children}
    </div>
  );
}
