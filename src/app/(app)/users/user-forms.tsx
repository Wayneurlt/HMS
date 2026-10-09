"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, Field, FormActions, FormGrid, Input, Select, SubmitButton } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { createUser, resetUserPassword, updateUser } from "./actions";

type Credentials = { name: string; login: string; password: string };

const ROLE_OPTIONS = [
  { value: "OWNER", label: "Owner" },
  { value: "HOSTEL_MANAGER", label: "Hostel manager" },
  { value: "KITCHEN_STAFF", label: "Kitchen staff" },
  { value: "STUDENT", label: "Student" },
];

/** Shows a one-time temporary password. It is never stored or retrievable again. */
function CredentialsModal({ creds, title, onClose }: { creds: Credentials; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-card border border-line-2 bg-card p-5 text-ink shadow-2xl"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-good-lo text-good">
          <KeyRound className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <p className="mt-3 text-sm text-ink-2">
        Share these details with <span className="font-medium text-ink">{creds.name}</span>. The temporary password is shown only
        once — they will be asked to change it when they sign in.
      </p>
      <dl className="mt-4 space-y-3 rounded-xl bg-card-2 p-4 text-sm">
        <div>
          <dt className="text-xs text-ink-3">Sign in with</dt>
          <dd className="mt-0.5 break-all text-ink">{creds.login || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Temporary password</dt>
          <dd className="mt-1 flex items-center gap-2">
            <code className="flex-1 select-all rounded-lg border border-line-2 bg-card px-3 py-2 font-mono text-base tracking-wider text-ink">
              {creds.password}
            </code>
            <button
              type="button"
              className={buttonClass("secondary", "icon")}
              aria-label="Copy password"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(creds.password);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? <Check className="h-4 w-4 text-good" /> : <Copy className="h-4 w-4" />}
            </button>
          </dd>
        </div>
      </dl>
      <div className="mt-5 flex justify-end">
        <button type="button" className={buttonClass("primary", "md")} onClick={() => ref.current?.close()}>
          Done
        </button>
      </div>
    </dialog>
  );
}

export type StudentOption = { id: string; fullName: string; phone: string; email: string | null };

function CreateUserFields({ students }: { students: StudentOption[] }) {
  const [role, setRole] = useState("HOSTEL_MANAGER");
  const [studentId, setStudentId] = useState("");
  const picked = students.find((s) => s.id === studentId);
  return (
    <>
      <FormGrid>
        <Field label="Role" name="role" required>
          <Select name="role" value={role} onChange={(e) => setRole(e.target.value)} options={ROLE_OPTIONS} />
        </Field>
        {role === "STUDENT" ? (
          <Field label="Student record" name="studentId" required hint={students.length ? undefined : "No students without a login"}>
            <Select
              name="studentId"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="Choose a student…"
              options={students.map((s) => ({ value: s.id, label: `${s.fullName} · ${s.phone}` }))}
            />
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
      </FormGrid>
      {/* key forces defaults to refresh when a student is picked */}
      <div key={picked?.id ?? "none"} className="space-y-4">
        <Field label="Full name" name="name" required>
          <Input name="name" defaultValue={picked?.fullName} maxLength={100} autoComplete="off" />
        </Field>
        <FormGrid>
          <Field label="Email" name="email" hint="Email or phone is required">
            <Input name="email" type="email" defaultValue={picked?.email ?? undefined} maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Phone" name="phone">
            <Input name="phone" type="tel" defaultValue={picked?.phone} placeholder="0712345678" autoComplete="off" />
          </Field>
        </FormGrid>
      </div>
      <Field label="Temporary password" name="password" hint="Leave empty to generate one. At least 8 characters with letters and a number.">
        <Input name="password" type="text" autoComplete="new-password" maxLength={128} />
      </Field>
    </>
  );
}

export function CreateUserButton({ students }: { students: StudentOption[] }) {
  const [creds, setCreds] = useState<Credentials | null>(null);
  return (
    <>
      <Dialog
        trigger={
          <>
            <Plus className="h-4 w-4" /> New user
          </>
        }
        triggerVariant="primary"
        title="New user"
        description="The user must change the temporary password at first sign-in."
      >
        <ActionForm action={createUser} onSuccess={(r) => r.data && setCreds(r.data)}>
          <CreateUserFields students={students} />
          <FormActions>
            <SubmitButton>Create account</SubmitButton>
          </FormActions>
        </ActionForm>
      </Dialog>
      {creds && <CredentialsModal creds={creds} title="Account created" onClose={() => setCreds(null)} />}
    </>
  );
}

export type EditableUser = { id: string; name: string; email: string | null; phone: string | null; role: string };

export function EditUserForm({ user, isSelf }: { user: EditableUser; isSelf: boolean }) {
  const roleLocked = isSelf || user.role === "STUDENT";
  return (
    <ActionForm action={updateUser} resetOnSuccess={false}>
      <input type="hidden" name="id" value={user.id} />
      <Field label="Full name" name="name" required>
        <Input name="name" defaultValue={user.name} maxLength={100} />
      </Field>
      <FormGrid>
        <Field label="Email" name="email" hint="Email or phone is required">
          <Input name="email" type="email" defaultValue={user.email ?? ""} maxLength={200} />
        </Field>
        <Field label="Phone" name="phone">
          <Input name="phone" type="tel" defaultValue={user.phone ?? ""} />
        </Field>
      </FormGrid>
      <Field
        label="Role"
        name="role"
        hint={isSelf ? "You cannot change your own role." : user.role === "STUDENT" ? "Student logins keep the Student role." : undefined}
      >
        {roleLocked ? (
          <>
            <input type="hidden" name="role" value={user.role} />
            <Select name="role-display" value={user.role} disabled options={ROLE_OPTIONS} onChange={() => {}} />
          </>
        ) : (
          <Select name="role" defaultValue={user.role} options={ROLE_OPTIONS.filter((o) => o.value !== "STUDENT")} />
        )}
      </Field>
      <FormActions>
        <SubmitButton>Save changes</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function ResetPasswordButton({ id, name }: { id: string; name: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <button type="button" className={buttonClass("ghost", "sm")} onClick={() => ref.current?.showModal()}>
        <KeyRound className="h-3.5 w-3.5" /> Reset password
      </button>
      <dialog
        ref={ref}
        className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-card border border-line-2 bg-card p-5 text-ink shadow-2xl"
      >
        <h2 className="text-base font-semibold">Reset password for {name}?</h2>
        <p className="mt-2 text-sm text-ink-2">
          A new temporary password will be generated. {name} will be signed out everywhere and must choose a new password at the
          next sign-in.
        </p>
        {error && <p className="mt-3 rounded-lg bg-bad-lo px-3 py-2 text-sm text-bad">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={buttonClass("ghost", "md")} onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            className={buttonClass("primary", "md")}
            onClick={() =>
              start(async () => {
                const res = await resetUserPassword({ id });
                if (res.ok && res.data) {
                  setError(null);
                  ref.current?.close();
                  toast("success", res.message ?? "Password reset");
                  setCreds(res.data);
                  router.refresh();
                } else if (!res.ok) {
                  setError(res.error);
                }
              })
            }
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Reset password
          </button>
        </div>
      </dialog>
      {creds && <CredentialsModal creds={creds} title="Password reset" onClose={() => setCreds(null)} />}
    </>
  );
}
