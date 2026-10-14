# Hostel Management System

Internal management system for a single student hostel: residents, rooms and beds, rent and payments, overnight attendance, meals, kitchen stock and spending, reports and an audit trail.

Built with Next.js 15 (App Router), TypeScript, PostgreSQL on Neon, Prisma 6, Tailwind CSS 4, Zod and Recharts.

> This is one hostel's own system: no tenants, subscriptions or marketing pages. Capacity starts around 10 students, and adding rooms and beds is all it takes to grow.

---

## 1. Requirements

- Node.js 20 or newer (22 LTS recommended)
- A Neon PostgreSQL database (or any PostgreSQL 14+)

## 2. Environment variables

Copy `.env.example` to `.env` and fill it in:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string (Neon). |
| `SESSION_SECRET` | yes in production | 32+ random characters used to sign session tokens. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CRON_SECRET` | optional | Protects `/api/cron/reminders`. Callers send `Authorization: Bearer <CRON_SECRET>`. |
| `MESSAGING_PROVIDER` | optional | External SMS/WhatsApp/email delivery for reminders. Leave empty to deliver in-app only. `log` prints messages to the server log (development). |
| `NEXT_PUBLIC_HOSTEL_TIMEZONE` | optional | Defaults to `Africa/Nairobi`. Decides what "today" means for rent, nights and meals. |

`DATABASE_URL` and the secrets are only read on the server and are never sent to the browser.

## 3. Neon PostgreSQL setup

1. Create a project at <https://neon.tech> and a database (for example `hostel`).
2. Under **Connection Details**, copy the connection string. It includes `?sslmode=require`.
   - For migrations, the **direct** (non-pooled) string is the most reliable.
   - The pooled string (`-pooler` in the host name) works well for the running app.
   - If you use the pooled string everywhere, add `&connect_timeout=15` to it.
3. Put the string in `.env` as `DATABASE_URL=...`.

## 4. Install and migrate

```bash
npm install                 # also runs `prisma generate`
npx prisma migrate deploy   # create the tables in your database
```

During development, after changing `prisma/schema.prisma`:

```bash
npm run db:migrate          # prisma migrate dev — creates a new migration
```

## 5. Create the first owner account

There is no hard-coded admin. Choose one of these:

- **Web:** start the app and open `/setup`. The page only works while no owner exists and disappears afterwards.
- **CLI:**
  ```bash
  npm run setup:owner -- --name "Jane Owner" --email owner@example.com --password "ChangeMe123"
  ```

The owner then creates the manager, kitchen staff and student accounts under **Users**. Student logins can also be created during check-in.

## 6. Development

```bash
npm run dev                 # http://localhost:3000
npm run typecheck           # TypeScript
npm run db:studio           # browse the database
```

### Demo data (optional)

```bash
npm run db:seed             # only runs on an empty database
npm run db:reset            # DROP all data, re-migrate and re-seed
```

The seed creates:
- 3 rooms and 10 beds
- 8 students: 6 active, 1 pending applicant and 1 checked out
- Paid, partially paid and overdue rent
- Overnight answers
- Breakfast and dinner menus with meal records
- Kitchen stock (including low and out-of-stock items), purchases, expenses, shopping requests and announcements

Demo logins (development only):

| Role | Login | Password |
|---|---|---|
| Owner | owner@hostel.test | Password123 |
| Manager | manager@hostel.test | Password123 |
| Kitchen staff | kitchen@hostel.test | Password123 |
| Students | student1@hostel.test … student6@hostel.test | Student123 |

**Never seed a production database.** The seed refuses to run when `NODE_ENV=production`. To remove demo data, run `npm run db:reset` (it re-seeds), or drop and re-create the database and run `npx prisma migrate deploy`.

## 7. Production build

```bash
npm run build               # prisma generate + next build
npm start
```

## 8. Deployment (Vercel + Neon)

1. Push the repository to GitHub and import it into Vercel.
2. Set `DATABASE_URL` (pooled Neon string), `SESSION_SECRET` and `CRON_SECRET` in the Vercel project settings.
3. Set the build command to `npx prisma migrate deploy && npm run build` so migrations run on each deploy. Alternatively, run `npx prisma migrate deploy` manually before deploying.
4. Schedule the daily rent job by adding `vercel.json`:
   ```json
   { "crons": [{ "path": "/api/cron/reminders", "schedule": "0 5 * * *" }] }
   ```
   Vercel cron sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set. Without a cron, the job still runs once a day the first time an owner or manager opens the dashboard.
5. Open `/setup` once to create the owner.

Any Node host works the same way (`npm run build && npm start`). On a VPS, schedule `npm run reminders:run` with cron instead.

## 9. User roles

| Role | Access |
|---|---|
| **Owner** | Everything, including kitchen finances, reports, users, settings and the activity log. Can edit or void rent records and payments. |
| **Hostel manager** | Operations: students, check-in/out, rooms and beds, rent records and payments, overnight status, meal timetable, announcements, kitchen requests (approve/reject) and operational reports. No kitchen finances, settings, staff accounts or activity log. |
| **Kitchen staff** | Kitchen-only dashboard: today's meals and expected numbers, stock, purchases, shopping requests, kitchen expenses, meal records and leftovers. No rent or student finances. |
| **Student** | Their own profile, room, rent and payments, overnight plans, the meal timetable and announcements. Nobody else's data. |

Permissions are defined in `src/lib/auth/permissions.ts` and enforced on the server in every page, server action and API route, not only in the navigation.

## 10. How the key rules work

- **Beds:** a bed can only have one active occupant. A unique database constraint enforces this. Check-out frees the bed immediately.
- **Rent:**
  - A monthly invoice is created automatically for every checked-in student (at check-in and by the daily job). The due day is per student.
  - Partial and multiple payments are supported. Outstanding = due − paid.
  - Status is *Paid*, *Partially paid*, *Pending* or *Overdue* (past the due date with a balance).
  - Payments and invoices are never deleted; the owner can void them with a reason, and the action is logged.
- **Reminders:** the default schedule is 3 days before the due date, on the due date, and 3 days after. You can change it under **Rent → Reminders**. Reminders are always recorded and delivered in-app. SMS/WhatsApp/email go through a pluggable provider (`src/lib/messaging`); add Africa's Talking, Twilio, SendPulse or another provider there.
- **Overnight and meals:** students mark each night as *Staying* or *Away*. No answer counts as expected.
  - Dinner expects tonight's residents who aren't away.
  - Breakfast is based on the previous night.
  - Meals: breakfast and dinner every day, plus lunch on Saturdays and Sundays (same rule as breakfast). Lunch can't be added on a weekday.
- **Rent:** the standard rent is KES 18,000 a month (Settings → default monthly rent); each student's rent can differ.
- **Kitchen:** purchases increase stock (total = quantity × unit cost). Consumption, waste and adjustments decrease it, and stock can never go negative. Low/out-of-stock status is automatic and raises a notification. Cost per meal = food cost ÷ meals served.
- **Audit log:** logins, check-ins/outs, payments, rent edits, stock changes, purchases, expenses, approvals, user changes and settings changes are all recorded.

See `docs/ARCHITECTURE.md` for the code layout and conventions.

## 11. Installing as an app (PWA)

Masqani is a Progressive Web App:
- **Install:** Android, Chrome, Edge and desktop browsers offer a one-tap install. On iPhone and iPad, use Safari's **Share → Add to Home Screen**.
- **Prompt:** every visit in a browser shows an install prompt, and an "Install app" button stays on screen until the app is installed.
- **Offline:** the service worker (`public/sw.js`) caches only app files, icons and an offline page. Pages and data are never cached, because they're personal. Without a connection, the app shows an offline screen.
- **Requirements:** installing needs HTTPS in production (Vercel provides it). Icons are in `public/icons/` and the manifest is `src/app/manifest.ts`.

## 12. Security notes

- Passwords are hashed with bcrypt (cost 12). Sessions are random tokens stored as HMAC hashes, in `httpOnly`, `SameSite=Lax` cookies (`Secure` in production).
- Login is rate-limited per account and per IP. Sensitive actions are rate-limited per user.
- All input is validated with Zod on the server. Output is escaped by React, and CSV exports neutralise spreadsheet formulas.
- Security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`) are set in `next.config.ts`.
