"use client";

import { useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardCheck } from "lucide-react";
import type { ActionResult } from "@/lib/action-types";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActionForm, Field, FormActions, FormGrid, Input, Select, SubmitButton } from "@/components/ui/form";
import { Button, Callout, DetailList } from "@/components/ui/primitives";
import { createStudent } from "../actions";
import { DUE_DAY_OPTIONS, PersonalFields, Step } from "../student-fields";

type Summary = Record<string, string>;

export function NewStudentForm({
  beds,
  defaults,
}: {
  beds: { value: string; label: string }[];
  defaults: { moveInDate: string; monthlyRent: number; rentDueDay: number };
}) {
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [pending, setPending] = useState(beds.length === 0);
  const [createLogin, setCreateLogin] = useState(false);
  const [summary, setSummary] = useState<Summary>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const anchor = useRef<HTMLDivElement>(null);

  const action = async (fd: FormData): Promise<ActionResult<{ id: string }>> => {
    const res = await createStudent(fd);
    if (!res.ok) setStep("edit");
    return res;
  };

  const review = () => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const fd = new FormData(form);
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    const missing: string[] = [];
    if (!get("fullName")) missing.push("full name");
    if (!get("phone")) missing.push("phone");
    if (!pending && !get("bedId")) missing.push("bed");
    if (!pending && !get("moveInDate")) missing.push("move-in date");
    if (!get("monthlyRent")) missing.push("monthly rent");
    if (createLogin && !get("loginIdentifier")) missing.push("login email/phone");
    if (createLogin && !get("loginPassword")) missing.push("temporary password");
    if (missing.length) {
      setLocalError(`Please fill in: ${missing.join(", ")}.`);
      return;
    }
    setLocalError(null);
    setSummary({
      fullName: get("fullName"),
      phone: get("phone"),
      email: get("email"),
      idNumber: get("idNumber"),
      emergency: [get("emergencyContactName"), get("emergencyContactPhone")].filter(Boolean).join(" · "),
      bed: beds.find((b) => b.value === get("bedId"))?.label ?? "",
      moveInDate: get("moveInDate"),
      monthlyRent: get("monthlyRent"),
      rentDueDay: get("rentDueDay"),
      login: createLogin ? get("loginIdentifier") : "",
    });
    setStep("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const editing = step === "edit";

  return (
    <ActionForm action={action} resetOnSuccess={false} redirectTo={(d) => (d ? `/students/${d.id}` : "/students")}>
      <div ref={anchor} className="space-y-5">
        {/* Edit steps stay mounted (hidden during review) so their values are submitted. */}
        <div
          className={cn("space-y-5", !editing && "hidden")}
          onKeyDown={(e) => {
            // Enter must not skip the confirmation step.
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
              e.preventDefault();
              review();
            }
          }}
        >
          <div className="grid items-start gap-5 @6xl:grid-cols-2">
          <Step n={1} title="Student details" hint="Who is moving in, and who to call in an emergency.">
            <PersonalFields />
          </Step>

          <div className="space-y-5">

          <Step n={2} title="Select a bed" hint="Only free beds (available or reserved) are listed.">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                name="savePending"
                checked={pending}
                onChange={(e) => setPending(e.target.checked)}
                className="h-4 w-4 accent-(--color-accent)"
              />
              Save as pending (no bed yet)
            </label>
            {pending ? (
              <Callout tone="warn">
                The student is saved with status Pending. No rent is generated until you check them in from their profile.
              </Callout>
            ) : beds.length === 0 ? (
              <Callout tone="bad">No free beds right now. Free a bed on the Rooms page or save as pending.</Callout>
            ) : (
              <Field label="Bed" name="bedId" required>
                <Select name="bedId" options={beds} placeholder="Choose a bed…" defaultValue="" />
              </Field>
            )}
          </Step>

          <div className="grid gap-5 @2xl:grid-cols-3 @6xl:grid-cols-1 @[110rem]:grid-cols-3">
            <Step n={3} title="Move-in date">
              <Field label="Move-in date" name="moveInDate" required={!pending} hint="Rent starts from this month">
                <Input name="moveInDate" type="date" defaultValue={defaults.moveInDate} disabled={pending} />
              </Field>
            </Step>
            <Step n={4} title="Monthly rent">
              <Field label="Monthly rent (KES)" name="monthlyRent" required hint="Defaults to the hostel rate">
                <Input name="monthlyRent" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={defaults.monthlyRent} />
              </Field>
            </Step>
            <Step n={5} title="Rent due day">
              <Field label="Due day of month" name="rentDueDay" required hint="1–28">
                <Select name="rentDueDay" defaultValue={String(defaults.rentDueDay)} options={DUE_DAY_OPTIONS} />
              </Field>
            </Step>
          </div>

          <Step title="Student login (optional)" hint="Lets the student see rent, announcements and set overnight status.">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                name="createLogin"
                checked={createLogin}
                onChange={(e) => setCreateLogin(e.target.checked)}
                className="h-4 w-4 accent-(--color-accent)"
              />
              Create student login
            </label>
            {createLogin && (
              <FormGrid>
                <Field label="Login email or phone" name="loginIdentifier" required>
                  <Input name="loginIdentifier" maxLength={200} autoComplete="off" placeholder="student@email.com or 0712345678" />
                </Field>
                <Field label="Temporary password" name="loginPassword" required hint="At least 8 characters with a letter and a number. They must change it at first sign-in.">
                  <Input name="loginPassword" type="text" maxLength={128} autoComplete="new-password" />
                </Field>
              </FormGrid>
            )}
          </Step>

          </div>
          </div>

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

        {!editing && (
          <Step n={6} title="Confirm" hint="Check everything before saving.">
            <DetailList
              items={[
                { label: "Full name", value: summary.fullName },
                { label: "Phone", value: summary.phone },
                { label: "Email", value: summary.email || "—" },
                { label: "ID / passport", value: summary.idNumber || "—" },
                { label: "Emergency contact", value: summary.emergency || "—" },
                { label: "Bed", value: pending ? "None — saved as pending" : summary.bed },
                { label: "Move-in date", value: pending ? "—" : formatDate(summary.moveInDate) },
                { label: "Monthly rent", value: formatMoney(Number(summary.monthlyRent) || 0) },
                { label: "Rent due day", value: `Day ${summary.rentDueDay} of each month` },
                { label: "Login", value: summary.login ? `${summary.login} (must change password)` : "No login" },
              ]}
            />
            {!pending && (
              <Callout tone="info">
                Checking in marks the bed occupied, activates the student and generates rent from the move-in month.
              </Callout>
            )}
            <FormActions className="justify-between">
              <Button variant="ghost" onClick={() => setStep("edit")}>
                <ArrowLeft className="h-4 w-4" /> Back to edit
              </Button>
              <SubmitButton>
                <CheckCircle2 className="h-4 w-4" /> {pending ? "Save as pending" : "Confirm check-in"}
              </SubmitButton>
            </FormActions>
          </Step>
        )}
      </div>
    </ActionForm>
  );
}
