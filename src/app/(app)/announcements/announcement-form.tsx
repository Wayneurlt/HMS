"use client";

import { ActionForm, Field, FormActions, FormGrid, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { createAnnouncement, updateAnnouncement } from "./actions";

export type AnnouncementFormValues = {
  id: string;
  title: string;
  message: string;
  priority: string;
  audience: string;
  /** "YYYY-MM-DD" (inclusive) or "" */
  expiresOn: string;
};

export function AnnouncementForm({ initial }: { initial?: AnnouncementFormValues }) {
  return (
    <ActionForm action={initial ? updateAnnouncement : createAnnouncement} resetOnSuccess={!initial}>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Title" name="title" required>
        <Input name="title" defaultValue={initial?.title} placeholder="e.g. Water outage on Saturday" maxLength={120} />
      </Field>
      <Field label="Message" name="message" required>
        <Textarea name="message" rows={5} defaultValue={initial?.message} maxLength={4000} />
      </Field>
      <FormGrid cols={3}>
        <Field label="Priority" name="priority">
          <Select
            name="priority"
            defaultValue={initial?.priority ?? "NORMAL"}
            options={[
              { value: "LOW", label: "Low" },
              { value: "NORMAL", label: "Normal" },
              { value: "HIGH", label: "High" },
              { value: "URGENT", label: "Urgent" },
            ]}
          />
        </Field>
        <Field label="Audience" name="audience">
          <Select
            name="audience"
            defaultValue={initial?.audience ?? "ALL"}
            options={[
              { value: "ALL", label: "Everyone" },
              { value: "STUDENTS", label: "Students" },
              { value: "STAFF", label: "Staff only" },
            ]}
          />
        </Field>
        <Field label="Show until" name="expiresOn" hint="Optional">
          <Input name="expiresOn" type="date" defaultValue={initial?.expiresOn} />
        </Field>
      </FormGrid>
      <FormActions>
        <SubmitButton>{initial ? "Save changes" : "Publish"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
