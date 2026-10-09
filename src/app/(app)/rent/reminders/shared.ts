/** Helpers shared by the reminders page (server) and rule form (client). No server imports. */

export const PLACEHOLDERS = ["name", "fullName", "month", "amount", "outstanding", "dueDate", "hostel"] as const;

export function offsetLabel(offset: number) {
  if (offset === 0) return "On due date";
  const n = Math.abs(offset);
  return `${n} day${n === 1 ? "" : "s"} ${offset < 0 ? "before" : "after"} due date`;
}

export function channelLabel(c: string) {
  return c === "IN_APP" ? "In-app" : c === "SMS" ? "SMS" : c === "WHATSAPP" ? "WhatsApp" : "Email";
}
