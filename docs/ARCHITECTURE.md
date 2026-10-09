# Architecture & conventions

Single-hostel internal system. Next.js 15 App Router · React 19 · TypeScript · Prisma 6 (PostgreSQL/Neon) · Tailwind CSS v4 · Zod 4 · Recharts 3 · lucide-react.

## Layout

```
prisma/schema.prisma        data model (source of truth)
prisma/seed.ts              demo data, built by calling the real services
src/middleware.ts           cookie pre-check only (NOT the security boundary)
src/lib/
  db.ts                     Prisma client (+ Tx type for transactions)
  dates.ts                  date-only helpers; hostel timezone (Africa/Nairobi)
  format.ts                 money/number formatting, toNumber() for Decimals, label()
  errors.ts                 ActionError (user-facing errors)
  action.ts                 defineAction(): auth + zod validation + error mapping
  rate-limit.ts             in-memory limiter for actions
  nav.ts                    role-aware navigation (display only)
  auth/permissions.ts       RBAC map — the single source of truth for access
  auth/guards.ts            requireUser / requirePermission / requireStudentSelf / authorize
  auth/session.ts           DB sessions; HMAC-hashed tokens in httpOnly cookie
  validation/common.ts      zod field helpers (zText, zMoney, zDate, …)
  services/                 business rules — use these, never re-implement them
    rent.ts                 invoice generation, payments, status, totals
    accommodation.ts        check-in, check-out, bed change
    attendance.ts           residency, overnight summaries, meal expectations
    inventory.ts            stock movements, purchases, stock status/alerts
    reminders.ts            daily rent job + reminder rules
    notifications.ts        notifyUsers / notifyRoles
    activity.ts             ACTIONS + logActivity (audit log)
    announcements.ts, settings.ts
  messaging/                provider interface for SMS/WhatsApp/email (pluggable)
src/components/
  ui/primitives.tsx         Card, Button, LinkButton, Badge, PageHeader, EmptyState,
                            Table/TH/TD, StatCard, SegmentedProgress, ProgressBar, Ring,
                            Avatar, DetailList, FilterTabs, Callout
  ui/form.tsx (client)      ActionForm, Field, Input, Select, Textarea, Checkbox,
                            SubmitButton, FormGrid, FormActions
  ui/dialog.tsx (client)    Dialog (modal with trigger), ConfirmAction
  ui/status.tsx             StatusBadge kind=rent|student|bed|stock|shopping|priority|overnight|reminder|role|active
  charts/index.tsx (client) TrendAreaChart, SimpleBarChart, DonutChart, Legend, SERIES
src/app/
  (auth)/                   login, first-run owner setup, auth actions
  (app)/                    everything behind sign-in, wrapped in AppShell
```

Reference module showing every convention end to end: `src/app/(app)/announcements/`.

## Rules

### Security
1. **Every page** starts with a guard: `await requirePermission("x.y")`, or `await requireStudentSelf()` for `/me/*`. Navigation hiding is cosmetic.
2. **Every mutation** is a server action built with `defineAction({ permission, schema }, handler)` in a colocated `actions.ts` that starts with `"use server"`. The wrapper authorizes before parsing input.
3. Student self-service code never accepts a student id from the client. It uses `user.studentId` from the session.
4. Route handlers (`app/api/**/route.ts`) call `authorize()` themselves (or check `CRON_SECRET` for cron).
5. Never render user content with `dangerouslySetInnerHTML`. React escaping plus `cleanText` in the zod helpers is the sanitisation strategy.

### Data
6. Business rules live in `src/lib/services`. Pages and actions call them. Multi-step writes run in `db.$transaction`.
7. Financial and historical rows are never hard-deleted. Use `voidedAt`/`deletedAt` plus a reason, and keep the audit log.
8. Log important actions with `logActivity(tx, { userId, action: ACTIONS.X, entityType, entityId, details })`.
9. **Money and quantities are Prisma `Decimal`.** Convert with `toNumber()` before passing data to client components or doing arithmetic, and round with `round2`.
10. **Calendar days** (rent months, due dates, nights, meals) are `@db.Date` values at 00:00 UTC of the hostel-local day:
    - Today's date comes from `today()` in `@/lib/dates`, never from `new Date()`.
    - Forms send `YYYY-MM-DD`, parsed with `zDate()`/`zOptDate()`.
    - Use `toISODate(d)` to fill `<input type="date">`.
    - Display with `formatDate`, `formatMonth` or `formatDayShort`.
11. Next 15: `params` and `searchParams` are Promises, so `await` them.

### UI
12. Dark theme tokens: `bg-page`, `bg-card`, `bg-card-2`, `bg-card-3`, `border-line`, `text-ink`, `text-ink-2`, `text-ink-3`, `text-accent`/`bg-accent`, and status `good|warn|bad|info` (with `-lo` tints).
    - Cards are `rounded-[var(--radius-card)]`; buttons are pills.
    - Chart series colours come from `SERIES` (validated order: purple, teal, amber, pink). Status colours are never used as series colours.
13. Mobile-first: grids collapse to one column, tables scroll horizontally inside their card, and actions wrap.
14. Every list has an empty state. Every form shows field errors (`<Field name>` matches the zod key).
15. After a successful action `ActionForm` toasts, closes its parent `Dialog` and calls `router.refresh()`. Actions should still call `revalidatePath`.

## Key business rules
- One active stay per bed and per student, enforced by the unique `Accommodation.activeBedId` / `activeStudentId` columns (NULL once the stay ends).
- Residency on night D: `startDate ≤ D < endDate`.
- Dinner on D expects night-D residents who are not AWAY. Breakfast on D uses night D−1. "Not responded" counts as expected.
- Rent status:
  - PAID when outstanding ≤ 0.
  - OVERDUE when past the due date with a balance, even if partly paid.
  - PARTIALLY_PAID otherwise when something is paid.
  - Else PENDING.
- Check-out:
  - Releases the bed and keeps the move-out month's invoice.
  - Voids unpaid later invoices.
  - Deletes overnight answers from the move-out night on.
  - Disables the student's login.
  - Payments are kept.
- Purchases add stock; consumption, waste and adjustments subtract. Stock can never go negative. Low stock means quantity ≤ minimum; out of stock means quantity ≤ 0.
- Kitchen food cost = non-voided purchases + kitchen expenses in category FOOD. Cost per meal = food cost ÷ meals served (from `MealRecord.servedCount`).
