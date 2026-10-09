"use client";

import { useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardCheck } from "lucide-react";
import type { ActionResult } from "@/lib/action-types";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActionForm, Field, FormActions, Input, Select, SubmitButton } from "@/components/ui/form";
import { Button, Callout, DetailList } from "@/components/ui/primitives";
import { checkInExisting } from "../../actions";
import { RentFields, Step } from "../../student-fields";

export function CheckInForm({
  studentId,
  studentName,
  beds,
  defaults,
}: {
  studentId: string;
  studentName: string;
  beds: { value: string; label: string }[];
  defaults: { moveInDate: string; monthlyRent: number; rentDueDay: number };
}) {
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [summary, setSummary] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const anchor = useRef<HTMLDivElement>(null);

  const action = async (fd: FormData): Promise<ActionResult<{ id: string }>> => {
    const res = await checkInExisting(fd);
    if (!res.ok) setStep("edit");
    return res;
  };

  const review = () => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const fd = new FormData(form);
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    const missing = [
      !get("bedId") && "bed",
      !get("moveInDate") && "move-in date",
      !get("monthlyRent") && "monthly rent",
    ].filter(Boolean);
    if (missing.length) {
      setLocalError(`Please fill in: ${missing.join(", ")}.`);
      return;
    }
    setLocalError(null);
    setSummary({
      bed: beds.find((b) => b.value === get("bedId"))?.label ?? "",
      moveInDate: get("moveInDate"),
      monthlyRent: get("monthlyRent"),
      rentDueDay: get("rentDueDay"),
    });
    setStep("review");
  };

  if (beds.length === 0) {
    return <Callout tone="warn" title="No free beds">Free or add a bed on the Rooms page, then come back.</Callout>;
  }

  return (
    <ActionForm action={action} resetOnSuccess={false} redirectTo={`/students/${studentId}`}>
      <input type="hidden" name="id" value={studentId} />
      <div ref={anchor} className="space-y-5">
        <div
          className={cn("space-y-5", step !== "edit" && "hidden")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
              e.preventDefault();
              review();
            }
          }}
        >
          <Step n={1} title="Bed and move-in date">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Bed" name="bedId" required hint="Available and reserved beds only">
                <Select name="bedId" options={beds} placeholder="Choose a bed…" defaultValue="" />
              </Field>
              <Field label="Move-in date" name="moveInDate" required hint="Rent starts from this month">
                <Input name="moveInDate" type="date" defaultValue={defaults.moveInDate} />
              </Field>
            </div>
          </Step>
          <Step n={2} title="Rent terms">
            <RentFields monthlyRent={defaults.monthlyRent} rentDueDay={defaults.rentDueDay} />
          </Step>
          {localError && (
            <p role="alert" className="rounded-xl bg-bad-lo px-4 py-3 text-sm text-bad">
              {localError}
            </p>
          )}
          <FormActions>
            <Button variant="primary" onClick={review}>
              <ClipboardCheck className="h-4 w-4" /> Review
            </Button>
          </FormActions>
        </div>

        {step === "review" && (
          <Step n={3} title="Confirm check-in">
            <DetailList
              items={[
                { label: "Student", value: studentName },
                { label: "Bed", value: summary.bed },
                { label: "Move-in date", value: formatDate(summary.moveInDate) },
                { label: "Monthly rent", value: formatMoney(Number(summary.monthlyRent) || 0) },
                { label: "Rent due day", value: `Day ${summary.rentDueDay} of each month` },
              ]}
            />
            <Callout tone="info">
              The bed becomes occupied, the student becomes Active, their login (if any) is re-enabled and rent is generated
              from the move-in month.
            </Callout>
            <FormActions className="justify-between">
              <Button variant="ghost" onClick={() => setStep("edit")}>
                <ArrowLeft className="h-4 w-4" /> Back to edit
              </Button>
              <SubmitButton>
                <CheckCircle2 className="h-4 w-4" /> Confirm check-in
              </SubmitButton>
            </FormActions>
          </Step>
        )}
      </div>
    </ActionForm>
  );
}
