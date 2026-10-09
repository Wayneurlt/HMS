/**
 * Create the first OWNER account from the command line (alternative to the /setup page).
 *
 *   npm run setup:owner -- --name "Jane Doe" --email jane@example.com --password "Secret123"
 *   npm run setup:owner -- --name "Jane Doe" --phone 0712345678 --password "Secret123"
 *
 * Arguments can also come from the environment: OWNER_NAME, OWNER_EMAIL, OWNER_PHONE, OWNER_PASSWORD.
 * Refuses to run when an owner already exists, unless --force-additional is passed.
 *
 * Runs under `tsx --conditions=react-server` so the server-only service modules can be imported.
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { ACTIONS, logActivity } from "@/lib/services/activity";
import { ensureDefaultReminderRules } from "@/lib/services/reminders";
import { getSettings } from "@/lib/services/settings";

function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out[a.slice(2)] = next;
        i++;
      } else {
        out[a.slice(2)] = true;
      }
    }
  }
  return out;
}

function str(v: string | true | undefined): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exitCode = 1;
  throw new Error(message);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(
      'Usage: npm run setup:owner -- --name "Full Name" (--email you@example.com | --phone 0712345678) --password "Secret123" [--force-additional]',
    );
    return;
  }

  const name = str(args.name) ?? str(process.env.OWNER_NAME);
  const email = (str(args.email) ?? str(process.env.OWNER_EMAIL))?.toLowerCase() ?? null;
  const phoneRaw = str(args.phone) ?? str(process.env.OWNER_PHONE);
  const phone = phoneRaw ? phoneRaw.replace(/[\s-]/g, "") : null;
  const password = (typeof args.password === "string" ? args.password : undefined) ?? process.env.OWNER_PASSWORD ?? "";
  const forceAdditional = args["force-additional"] === true || args["force-additional"] === "true";

  const errors: string[] = [];
  if (!name) errors.push("--name is required");
  else if (name.length > 100) errors.push("Name must be at most 100 characters");
  if (!email && !phone) errors.push("Provide --email and/or --phone");
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)) errors.push("Email is not valid");
  if (phone && !/^\+?\d{9,15}$/.test(phone)) errors.push("Phone is not valid (e.g. 0712345678 or +254712345678)");
  if (password.length < 8) errors.push("Password must be at least 8 characters");
  else if (password.length > 128) errors.push("Password is too long");
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.push("Password must contain letters and at least one number");
  if (errors.length) fail(`Invalid input:\n  - ${errors.join("\n  - ")}`);

  const passwordHash = await hashPassword(password);

  const user = await db.$transaction(async (tx) => {
    // Same lock as the /setup page so the two cannot race.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(424242)`;
    const owners = await tx.user.count({ where: { role: "OWNER" } });
    if (owners > 0 && !forceAdditional) {
      fail("An owner account already exists. Pass --force-additional to create another owner.");
    }
    const conflict = await tx.user.findFirst({
      where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
      select: { id: true },
    });
    if (conflict) fail("Another account already uses that email or phone.");

    const created = await tx.user.create({
      data: { name: name!, email, phone, passwordHash, role: "OWNER" },
    });
    await getSettings(tx);
    await logActivity(tx, {
      userId: created.id,
      action: owners > 0 ? ACTIONS.USER_CREATED : ACTIONS.OWNER_SETUP,
      entityType: "User",
      entityId: created.id,
      details: { via: "cli", role: "OWNER" },
    });
    return created;
  });

  await ensureDefaultReminderRules();

  console.log(`\n✔ Owner account created for ${user.name} (${user.email ?? user.phone}).`);
  console.log("  Sign in at /login with these credentials.\n");
}

main()
  .catch((e) => {
    if (process.exitCode !== 1) {
      console.error(e);
      process.exitCode = 1;
    }
  })
  .finally(async () => {
    await db.$disconnect();
  });
