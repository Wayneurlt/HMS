"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eraser, Loader2, Plane } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, FormActions, FormGrid, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { addDays, parseDateOnly, toISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { clearNightStatus, setNightStatus, setRangeStatus } from "./actions";

type Answer = "STAYING" | "AWAY" | "NOT_RESPONDED";

/** One-tap Staying / Away (and optional Clear) for a single night. */
export function NightQuickButtons({
  date,
  current,
  showClear = false,
  size = "sm",
  stayLabel = "Staying",
  awayLabel = "Away",
}: {
  /** "YYYY-MM-DD" */
  date: string;
  current: Answer;
  showClear?: boolean;
  size?: "sm" | "md";
  stayLabel?: string;
  awayLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  const run = (key: string, fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
    setBusy(key);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast("success", res.message ?? "Saved");
        router.refresh();
      } else {
        toast("error", res.error ?? "Something went wrong");
      }
      setBusy(null);
    });
  };

  const spin = (key: string) => pending && busy === key && <Loader2 className="h-3.5 w-3.5 animate-spin" />;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        aria-pressed={current === "STAYING"}
        onClick={() => run("STAYING", () => setNightStatus({ date, status: "STAYING" }))}
        className={buttonClass(
          current === "STAYING" ? "primary" : "secondary",
          size,
          cn(current === "STAYING" && "bg-good text-white hover:bg-good/90"),
        )}
      >
        {spin("STAYING") || <Check className="h-3.5 w-3.5" />}
        {stayLabel}
      </button>
      <button
        type="button"
        disabled={pending}
        aria-pressed={current === "AWAY"}
        onClick={() => run("AWAY", () => setNightStatus({ date, status: "AWAY" }))}
        className={buttonClass(
          current === "AWAY" ? "primary" : "secondary",
          size,
          cn(current === "AWAY" && "bg-warn text-white hover:bg-warn/90"),
        )}
      >
        {spin("AWAY") || <Plane className="h-3.5 w-3.5" />}
        {awayLabel}
      </button>
      {showClear && current !== "NOT_RESPONDED" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run("CLEAR", () => clearNightStatus({ date }))}
          className={buttonClass("ghost", size)}
          title="Clear answer (back to Not responded)"
        >
          {spin("CLEAR") || <Eraser className="h-3.5 w-3.5" />}
          Clear
        </button>
      )}
    </div>
  );
}

/** Away with an expected return date and a note, for one night. */
export function AwayDetailsDialog({
  date,
  dateLabel,
  defaultReturn,
  defaultNote,
}: {
  date: string;
  dateLabel: string;
  defaultReturn: string;
  defaultNote?: string | null;
}) {
  return (
    <Dialog
      trigger="Details…"
      triggerVariant="ghost"
      triggerSize="sm"
      title="Away for the night"
      description={`Night of ${dateLabel}. The kitchen will not prepare dinner that night or breakfast the next morning for you.`}
    >
      <ActionForm action={setNightStatus} resetOnSuccess={false}>
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="status" value="AWAY" />
        <Field label="Expected return" name="expectedReturnDate" hint="Optional — the day you expect to be back">
          <Input name="expectedReturnDate" type="date" defaultValue={defaultReturn} min={toISODate(addDays(parseDateOnly(date), 1))} />
        </Field>
        <Field label="Note" name="note" hint="Optional, e.g. visiting family">
          <Textarea name="note" rows={2} maxLength={300} defaultValue={defaultNote ?? ""} />
        </Field>
        <FormActions>
          <SubmitButton>Mark as away</SubmitButton>
        </FormActions>
      </ActionForm>
    </Dialog>
  );
}

/** "I'll be away from X to Y" / "I'm staying from X to Y". */
export function RangeForm({ todayISO }: { todayISO: string }) {
  const tomorrow = toISODate(addDays(parseDateOnly(todayISO), 1));
  const [from, setFrom] = useState(todayISO);
  const [to, setTo] = useState(tomorrow);
  const [status, setStatus] = useState<"AWAY" | "STAYING">("AWAY");
  const [ret, setRet] = useState<string>(toISODate(addDays(parseDateOnly(tomorrow), 1)));
  const [retTouched, setRetTouched] = useState(false);

  const nextDay = (iso: string) => {
    try {
      return toISODate(addDays(parseDateOnly(iso), 1));
    } catch {
      return "";
    }
  };

  return (
    <ActionForm
      action={setRangeStatus}
      resetOnSuccess={false}
      onSuccess={() => setRetTouched(false)}
    >
      <FormGrid cols={2}>
        <Field label="I will be" name="status">
          <Select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as "AWAY" | "STAYING")}
            options={[
              { value: "AWAY", label: "Away" },
              { value: "STAYING", label: "Staying" },
            ]}
          />
        </Field>
        <div className="hidden sm:block" />
        <Field label="From (first night)" name="from" required>
          <Input
            name="from"
            type="date"
            min={todayISO}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              if (to && e.target.value > to) {
                setTo(e.target.value);
                if (!retTouched) setRet(nextDay(e.target.value));
              }
            }}
          />
        </Field>
        <Field label="To (last night)" name="to" required hint="Up to 60 nights">
          <Input
            name="to"
            type="date"
            min={from || todayISO}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              if (!retTouched) setRet(nextDay(e.target.value));
            }}
          />
        </Field>
        {status === "AWAY" && (
          <Field label="Expected return" name="expectedReturnDate" hint="Defaults to the day after the last night">
            <Input
              name="expectedReturnDate"
              type="date"
              min={to ? nextDay(to) : undefined}
              value={ret}
              onChange={(e) => {
                setRet(e.target.value);
                setRetTouched(true);
              }}
            />
          </Field>
        )}
        <Field label="Note" name="note" hint="Optional" className={status === "AWAY" ? "" : "sm:col-span-2"}>
          <Input name="note" maxLength={300} placeholder={status === "AWAY" ? "e.g. Going home for the weekend" : ""} />
        </Field>
      </FormGrid>
      <FormActions>
        <SubmitButton>{status === "AWAY" ? "Mark as away" : "Mark as staying"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
