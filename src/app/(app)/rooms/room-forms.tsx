"use client";

import { ActionForm, Field, FormActions, FormGrid, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { addBeds, createRoom, updateBed, updateRoom } from "./actions";

export type RoomFormValues = { id: string; name: string; floor: string; description: string };

export function RoomForm({ initial }: { initial?: RoomFormValues }) {
  return (
    <ActionForm action={initial ? updateRoom : createRoom} resetOnSuccess={!initial}>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <FormGrid>
        <Field label="Room name" name="name" required>
          <Input name="name" defaultValue={initial?.name} placeholder="e.g. Room 4" maxLength={60} />
        </Field>
        <Field label="Floor" name="floor" hint="Optional">
          <Input name="floor" defaultValue={initial?.floor} placeholder="e.g. Ground floor" maxLength={60} />
        </Field>
      </FormGrid>
      <Field label="Description" name="description" hint="Optional">
        <Textarea name="description" defaultValue={initial?.description} rows={3} maxLength={500} />
      </Field>
      <FormActions>
        <SubmitButton>{initial ? "Save changes" : "Create room"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function AddBedsForm({ roomId, suggestion }: { roomId: string; suggestion: string }) {
  return (
    <ActionForm action={addBeds}>
      <input type="hidden" name="roomId" value={roomId} />
      <Field label="Bed label(s)" name="labels" required hint="Separate several labels with commas, e.g. Bed 5, Bed 6">
        <Input name="labels" defaultValue={suggestion} maxLength={400} />
      </Field>
      <FormActions>
        <SubmitButton>Add beds</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export type BedFormValues = { id: string; label: string; status: string; notes: string; occupied: boolean };

export function BedForm({ initial }: { initial: BedFormValues }) {
  return (
    <ActionForm action={updateBed} resetOnSuccess={false}>
      <input type="hidden" name="id" value={initial.id} />
      <FormGrid>
        <Field label="Label" name="label" required>
          <Input name="label" defaultValue={initial.label} maxLength={30} />
        </Field>
        <Field
          label="Status"
          name="status"
          hint={initial.occupied ? "Occupied beds are released automatically at check-out." : "Occupied is set by check-in only."}
        >
          {initial.occupied ? (
            <Input name="status_display" value="Occupied" disabled readOnly />
          ) : (
            <Select
              name="status"
              defaultValue={initial.status}
              options={[
                { value: "AVAILABLE", label: "Available" },
                { value: "RESERVED", label: "Reserved" },
                { value: "MAINTENANCE", label: "Maintenance" },
              ]}
            />
          )}
        </Field>
      </FormGrid>
      <Field label="Notes" name="notes" hint="Optional, e.g. broken slat, reserved for new intake">
        <Textarea name="notes" defaultValue={initial.notes} rows={2} maxLength={300} />
      </Field>
      <FormActions>
        <SubmitButton>Save bed</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
