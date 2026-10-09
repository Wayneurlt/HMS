/**
 * Run the daily rent job (invoice generation, overdue marking, reminders) from the CLI.
 *
 *   npm run reminders:run
 *
 * Useful for a system cron when the HTTP endpoint (/api/cron/reminders) is not used.
 */
import { db } from "@/lib/db";
import { runRentReminders } from "@/lib/services/reminders";

async function main() {
  const result = await runRentReminders();
  console.log(`Rent reminders for ${result.date}`);
  console.log(`  New rent records:  ${result.invoicesGenerated}`);
  console.log(`  Marked overdue:    ${result.markedOverdue}`);
  console.log(`  Reminders created: ${result.created} (sent ${result.sent}, skipped ${result.skipped}, failed ${result.failed})`);
}

main()
  .catch((e) => {
    console.error("Reminder run failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
