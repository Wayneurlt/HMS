/**
 * Test-data seed. Fills every section of the app with realistic data by calling the same
 * services the app uses, so everything follows the business rules (rent statuses, stock
 * ledger, audit log, notifications…).
 *
 *   npm run db:seed     # adds test data; refuses if rooms or students already exist
 *   npm run db:reset    # drop everything, re-migrate and re-seed (local databases)
 *
 * Works on an empty database or one that already has accounts:
 *  - the first active OWNER is used as the actor (owner@hostel.test is created only if no owner exists)
 *  - manager@hostel.test / kitchen@hostel.test are reused if present, created otherwise
 *  - hostel name and any contact details you already set are kept
 *
 * Test passwords (staff: Password123, students: Student123) are public — reset or remove
 * these accounts before using the system for real.
 */
import type { InventoryCategory, MealType, PaymentMethod, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { addDays, addMonths, monthStart, today as todayFn, toISODate } from "@/lib/dates";
import { round2, toNumber } from "@/lib/format";
import { changeBed, checkInStudent, checkOutStudent } from "@/lib/services/accommodation";
import { editInvoice, recordPayment, voidPayment } from "@/lib/services/rent";
import { moveStock, recordPurchase, voidPurchase } from "@/lib/services/inventory";
import { ensureDefaultReminderRules, runRentReminders } from "@/lib/services/reminders";
import { mealExpectation } from "@/lib/services/attendance";
import { notifyRoles } from "@/lib/services/notifications";

const STAFF_PW = "Password123";
const STUDENT_PW = "Student123";

async function upsertStaff(email: string, name: string, phone: string, role: Role, passwordHash: string) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;
  return db.user.create({ data: { name, email, phone, role, passwordHash } });
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed with NODE_ENV=production.");
  const [rooms, students] = await Promise.all([db.room.count(), db.student.count()]);
  if (rooms > 0 || students > 0) {
    console.log(`Database already has ${rooms} room(s) and ${students} student(s) — skipping seed to avoid duplicates.`);
    console.log("To start over on a local database use `npm run db:reset`.");
    return;
  }

  const today = todayFn();
  const m = (offset: number, day: number) => {
    const s = addMonths(monthStart(today), offset);
    return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), day));
  };
  const step = (label: string) => console.log(`• ${label}`);
  console.log(`Seeding test data (today = ${toISODate(today)})…`);

  // ── Settings (keep anything already set) ──
  const settings = await db.hostelSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, hostelName: "Greenview Hostel" } });
  await db.hostelSettings.update({
    where: { id: 1 },
    data: {
      address: settings.address ?? "Kilimani, Nairobi",
      phone: settings.phone ?? "+254700000000",
      email: settings.email ?? "office@hostel.test",
    },
  });
  await ensureDefaultReminderRules();
  await db.reminderRule.upsert({
    where: { offsetDays: 7 },
    update: {},
    create: {
      name: "7 days overdue (SMS)",
      offsetDays: 7,
      channel: "SMS",
      template: "Hi {name}, your {month} rent at {hostel} is a week overdue. Balance: {outstanding}. Please pay today.",
    },
  });

  // ── Accounts ──
  step("accounts");
  const staffHash = await hashPassword(STAFF_PW);
  const studentHash = await hashPassword(STUDENT_PW);
  const owner =
    (await db.user.findFirst({ where: { role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" } })) ??
    (await db.user.create({ data: { name: "Daniel Mwangi", email: "owner@hostel.test", phone: "+254711000001", role: "OWNER", passwordHash: staffHash } }));
  const manager = await upsertStaff("manager@hostel.test", "Grace Wanjiru", "+254711000002", "HOSTEL_MANAGER", staffHash);
  const cook = await upsertStaff("kitchen@hostel.test", "Peter Otieno", "+254711000003", "KITCHEN_STAFF", staffHash);
  if (!(await db.user.findUnique({ where: { email: "former.cook@hostel.test" } }))) {
    await db.user.create({
      data: { name: "Mary Akinyi", email: "former.cook@hostel.test", role: "KITCHEN_STAFF", passwordHash: staffHash, isActive: false },
    });
  }

  // ── Rooms & beds: 4 rooms, 12 beds ──
  step("rooms & beds");
  const layout: [string, string, number][] = [
    ["Room 1", "Ground floor", 4],
    ["Room 2", "Ground floor", 3],
    ["Room 3", "First floor", 3],
    ["Room 4", "First floor", 2],
  ];
  const bed: Record<string, string> = {}; // "R1B1" → bed id
  for (const [name, floor, count] of layout) {
    const room = await db.room.create({ data: { name, floor, description: `${count}-bed room` } });
    for (let i = 1; i <= count; i++) {
      const b = await db.bed.create({ data: { roomId: room.id, label: `Bed ${i}` } });
      bed[`R${name.slice(-1)}B${i}`] = b.id;
    }
  }

  // ── Past residents first (their stays end before current residents take the beds) ──
  step("past residents");
  const methods: PaymentMethod[] = ["MPESA", "MPESA", "BANK", "CASH", "OTHER"];
  let ref = 0;
  const payInvoice = async (invId: string, amount: number, method?: PaymentMethod, by = manager.id) => {
    const inv = await db.rentInvoice.findUniqueOrThrow({ where: { id: invId } });
    const paidAt = new Date(Math.max(inv.periodMonth.getTime(), Math.min(addDays(inv.dueDate, -2).getTime(), today.getTime())));
    const mtd = method ?? methods[ref % methods.length]!;
    ref++;
    return recordPayment(
      {
        invoiceId: inv.id,
        amount: round2(amount),
        paidAt,
        method: mtd,
        reference: mtd === "MPESA" ? `S${(7100000 + ref * 37).toString(36).toUpperCase()}K` : mtd === "BANK" ? `BNK-${1000 + ref}` : null,
        notes: mtd === "OTHER" ? "Paid by sponsor" : null,
      },
      by,
    );
  };
  const invoicesOf = (studentId: string) =>
    db.rentInvoice.findMany({ where: { studentId, voidedAt: null }, orderBy: { periodMonth: "asc" } });
  const isCurrent = (d: Date) => d.getTime() === monthStart(today).getTime();

  const pastPaid = await db.student.create({ data: { fullName: "Victor Omondi", phone: "+254722100012", monthlyRent: 10000, rentDueDay: 5, status: "PENDING" } });
  await checkInStudent({ studentId: pastPaid.id, bedId: bed["R2B3"]!, startDate: m(-6, 1), monthlyRent: 10000, rentDueDay: 5 }, owner.id);
  const pastOwing = await db.student.create({ data: { fullName: "George Achieng", phone: "+254722100013", monthlyRent: 9500, rentDueDay: 5, status: "PENDING" } });
  await checkInStudent({ studentId: pastOwing.id, bedId: bed["R3B3"]!, startDate: m(-5, 1), monthlyRent: 9500, rentDueDay: 5 }, owner.id);
  // Past residents: Victor paid in full then left; George left owing his last month.
  for (const inv of await invoicesOf(pastPaid.id)) if (inv.periodMonth.getTime() <= m(-3, 1).getTime()) await payInvoice(inv.id, toNumber(inv.amountDue));
  await checkOutStudent({ studentId: pastPaid.id, moveOutDate: m(-3, 28), notes: "Moved closer to campus." }, manager.id);
  // George pays up to two months ago; last month stays unpaid and is still owed after he leaves.
  for (const inv of await invoicesOf(pastOwing.id)) if (inv.periodMonth.getTime() <= m(-2, 1).getTime()) await payInvoice(inv.id, toNumber(inv.amountDue));
  await checkOutStudent({ studentId: pastOwing.id, moveOutDate: m(-1, 20), notes: "Left before the end of the month; balance to be collected." }, manager.id);

  // ── Students ──
  step("students & check-ins");
  type P = { name: string; phone: string; bed: string; start: Date; rent: number; dueDay?: number; login?: boolean; notes?: string };
  const people: P[] = [
    { name: "Brian Kamau", phone: "0722100001", bed: "R1B1", start: m(-5, 1), rent: 10000, login: true },
    { name: "Kevin Ochieng", phone: "0722100002", bed: "R1B2", start: m(-4, 1), rent: 10000, login: true },
    { name: "Samuel Kiprono", phone: "0722100003", bed: "R1B3", start: m(-3, 3), rent: 10000, login: true },
    { name: "Dennis Mutua", phone: "0722100004", bed: "R2B1", start: m(-3, 10), rent: 9500, dueDay: 25, login: true, notes: "Prefers lower bunk." },
    { name: "Felix Njoroge", phone: "0722100005", bed: "R2B2", start: m(-2, 1), rent: 10000, login: true },
    { name: "Allan Wekesa", phone: "0722100006", bed: "R3B1", start: m(-1, 15), rent: 11000, dueDay: 28, login: true },
    { name: "Ian Mwangi", phone: "0722100007", bed: "R2B3", start: m(-2, 5), rent: 10000, login: true },
    { name: "Collins Otieno", phone: "0722100008", bed: "R3B2", start: m(0, 1), rent: 10500, login: true, notes: "Joined this month." },
    { name: "Mark Kiplagat", phone: "0722100009", bed: "R1B4", start: m(-4, 1), rent: 10000, login: false, notes: "Suspended pending a disciplinary meeting." },
  ];
  const s: Record<string, { id: string; userId: string | null; name: string }> = {};
  let n = 0;
  for (const p of people) {
    n++;
    const user = p.login
      ? await db.user.create({
          data: { name: p.name, email: `student${n}@hostel.test`, phone: `+254${p.phone.slice(1)}`, passwordHash: studentHash, role: "STUDENT" },
        })
      : null;
    const st = await db.student.create({
      data: {
        userId: user?.id ?? null,
        fullName: p.name,
        phone: `+254${p.phone.slice(1)}`,
        email: user ? `student${n}@hostel.test` : null,
        emergencyContactName: `Parent of ${p.name.split(" ")[0]}`,
        emergencyContactPhone: `+2547332000${String(n).padStart(2, "0")}`,
        idNumber: String(30000000 + n * 1111),
        monthlyRent: p.rent,
        rentDueDay: p.dueDay ?? 5,
        status: "PENDING",
        notes: p.notes ?? null,
      },
    });
    await checkInStudent({ studentId: st.id, bedId: bed[p.bed]!, startDate: p.start, monthlyRent: p.rent, rentDueDay: p.dueDay ?? 5 }, manager.id);
    s[p.name] = { id: st.id, userId: user?.id ?? null, name: p.name };
  }
  await db.student.update({ where: { id: s["Mark Kiplagat"]!.id }, data: { status: "SUSPENDED" } });

  // Bed move: Ian moves from Room 2 to Room 4 last month.
  await changeBed({ studentId: s["Ian Mwangi"]!.id, newBedId: bed["R4B1"]!, effectiveDate: m(-1, 10) }, manager.id);

  // Applicants: one waiting, one with a reserved bed.
  await db.student.create({
    data: { fullName: "Joseph Kariuki", phone: "+254722100010", email: "joseph.k@example.com", monthlyRent: 10000, rentDueDay: 5, status: "PENDING", notes: "Viewing next week." },
  });
  const reservedFor = await db.student.create({
    data: { fullName: "Eric Waweru", phone: "+254722100011", monthlyRent: 10000, rentDueDay: 5, status: "PENDING", notes: "Moving in on the 1st — Room 3 Bed 3 is reserved." },
  });
  await db.bed.update({ where: { id: bed["R3B3"]! }, data: { status: "RESERVED", notes: `Reserved for ${reservedFor.fullName}` } });
  await db.bed.update({ where: { id: bed["R4B2"]! }, data: { status: "MAINTENANCE", notes: "Broken bed frame — awaiting repair" } });

  // ── Rent ──
  step("rent & payments");
  // Owner gave Brian a KES 1,000 discount on his first month (edited invoice, logged).
  const brianFirst = (await db.rentInvoice.findMany({ where: { studentId: s["Brian Kamau"]!.id }, orderBy: { periodMonth: "asc" }, take: 1 }))[0]!;
  if (toNumber(brianFirst.amountPaid) === 0) await editInvoice(brianFirst.id, { amountDue: 9000, dueDate: brianFirst.dueDate, notes: "Welcome discount" }, owner.id);
  // Current residents — a mix of every rent status.
  const plan: Record<string, "all" | "partial" | "unpaid-current" | "two-months-behind"> = {
    "Brian Kamau": "all",
    "Kevin Ochieng": "partial",
    "Samuel Kiprono": "unpaid-current",
    "Dennis Mutua": "two-months-behind",
    "Felix Njoroge": "all",
    "Allan Wekesa": "partial",
    "Ian Mwangi": "all",
    "Collins Otieno": "unpaid-current",
    "Mark Kiplagat": "two-months-behind",
  };
  for (const [name, mode] of Object.entries(plan)) {
    const invs = await invoicesOf(s[name]!.id);
    for (const [i, inv] of invs.entries()) {
      const due = toNumber(inv.amountDue);
      const behind = mode === "two-months-behind" && i >= invs.length - 2;
      if (behind) continue;
      if (isCurrent(inv.periodMonth)) {
        if (mode === "all") await payInvoice(inv.id, due);
        else if (mode === "partial") await payInvoice(inv.id, Math.round(due * 0.6));
        continue;
      }
      // Older months: pay in two instalments sometimes, to show multiple payments per record.
      if (i % 3 === 1) {
        await payInvoice(inv.id, 4000);
        await payInvoice(inv.id, due - 4000);
      } else await payInvoice(inv.id, due);
    }
  }
  // A payment recorded twice by mistake and voided.
  const kevinCurrent = (await invoicesOf(s["Kevin Ochieng"]!.id)).find((i) => isCurrent(i.periodMonth))!;
  const dup = await payInvoice(kevinCurrent.id, 1000, "CASH");
  await voidPayment(dup.paymentId, "Duplicate entry — cash was counted twice", owner.id);

  // ── Overnight: last 21 nights → next 7 ──
  step("overnight answers");
  const stays = await db.accommodation.findMany({ select: { studentId: true, startDate: true, endDate: true } });
  const residentOn = (studentId: string, d: Date) =>
    stays.some((st) => st.studentId === studentId && st.startDate <= d && (!st.endDate || st.endDate > d));
  const active = Object.values(s);
  for (let d = -21; d <= 7; d++) {
    const night = addDays(today, d);
    const rows = [];
    for (const [i, st] of active.entries()) {
      if (!residentOn(st.id, night)) continue;
      let status: "STAYING" | "AWAY" | null = "STAYING";
      let expectedReturnDate: Date | null = null;
      let note: string | null = null;
      if (d >= 0 && d <= 2 && (i === 1 || i === 4)) {
        status = "AWAY";
        expectedReturnDate = addDays(today, 3);
        note = "Home for the weekend";
      } else if (d >= 3 && d <= 5 && i === 6) {
        status = "AWAY";
        expectedReturnDate = addDays(today, 6);
        note = "Field trip";
      } else if (d < 0 && (d + i) % 6 === 0) status = "AWAY";
      else if (d > 0 && (i + d) % 3 === 0) status = null; // not responded yet
      if (!status) continue;
      rows.push({ studentId: st.id, date: night, status, expectedReturnDate, note, updatedById: st.userId ?? manager.id });
    }
    if (rows.length) await db.overnightStatus.createMany({ data: rows });
  }

  // ── Meals: 28 days back → 14 days ahead, records + attendance for past meals ──
  step("meals, meal records & attendance");
  const breakfasts = ["Tea, bread, eggs", "Tea, mandazi, sausages", "Porridge, bread, bananas", "Tea, chapati, eggs", "Cocoa, bread, boiled eggs", "Tea, sweet potatoes, arrow roots", "Uji, bread, peanut butter"];
  const dinners = ["Ugali, beef stew, sukuma wiki", "Rice, beans, cabbage", "Chapati, ndengu, kachumbari", "Pilau, kachumbari", "Ugali, fried fish, greens", "Githeri, avocado", "Rice, chicken stew, vegetables"];
  for (let d = -28; d <= 14; d++) {
    const date = addDays(today, d);
    for (const type of ["BREAKFAST", "DINNER"] as MealType[]) {
      const list = type === "BREAKFAST" ? breakfasts : dinners;
      const idx = (d + 28) % list.length;
      const meal = await db.meal.create({
        data: { date, type, menu: list[idx]!, notes: type === "DINNER" && idx === 6 ? "Sunday special" : null, createdById: manager.id },
      });
      if (d >= 0) continue;
      const exp = await mealExpectation(date, type);
      const missed = exp.expectedStudents.filter((_, i) => (i + d) % 7 === 0).map((x) => x.studentId);
      const served = Math.max(0, exp.expected - missed.length);
      await db.mealRecord.create({
        data: {
          mealId: meal.id,
          expectedCount: exp.expected,
          servedCount: served,
          leftoverPortions: (d + 28) % 4 === 0 ? 1.5 : (d + 28) % 3 === 0 ? 1 : (d + 28) % 5 === 0 ? 0.5 : 0,
          notes: missed.length ? `${missed.length} expected student(s) did not turn up` : null,
          recordedById: cook.id,
        },
      });
      if (d >= -7 && exp.expectedStudents.length) {
        await db.mealAttendance.createMany({
          data: exp.expectedStudents.map((x) => ({ mealId: meal.id, studentId: x.studentId, attended: !missed.includes(x.studentId) })),
        });
      }
    }
  }

  // ── Kitchen stock ──
  step("stock, purchases, usage");
  const items: [string, InventoryCategory, string, number, number, number, string][] = [
    ["Rice", "GRAINS", "kg", 25, 10, 50, "Naivas Wholesale"],
    ["Maize flour", "GRAINS", "kg", 18, 10, 40, "Naivas Wholesale"],
    ["Wheat flour", "GRAINS", "kg", 6, 5, 20, "Naivas Wholesale"],
    ["Beans", "GRAINS", "kg", 10, 5, 25, "Marikiti Market"],
    ["Cooking oil", "CONDIMENTS", "L", 3, 4, 20, "Naivas Wholesale"],
    ["Sugar", "CONDIMENTS", "kg", 8, 3, 15, "Naivas Wholesale"],
    ["Salt", "CONDIMENTS", "kg", 2, 1, 5, "Naivas Wholesale"],
    ["Milk", "DAIRY", "L", 0, 5, 30, "Brookside Depot"],
    ["Eggs", "PROTEIN", "pcs", 60, 30, 180, "Kamau Poultry"],
    ["Beef", "PROTEIN", "kg", 4, 3, 10, "City Butchery"],
    ["Chicken", "PROTEIN", "kg", 0, 2, 8, "City Butchery"],
    ["Vegetables (sukuma)", "VEGETABLES", "bunch", 6, 5, 20, "Marikiti Market"],
    ["Bananas", "FRUITS", "bunch", 3, 2, 8, "Marikiti Market"],
    ["Tea leaves", "BEVERAGES", "kg", 1.5, 1, 5, "Naivas Wholesale"],
    ["Gas (13kg cylinder)", "COOKING_FUEL", "cylinder", 1, 1, 3, "Total Gas"],
    ["Dish soap", "CLEANING", "bottle", 4, 2, 10, "Naivas Wholesale"],
  ];
  const item: Record<string, string> = {};
  for (const [name, category, unit, qty, min, max, supplier] of items) {
    const it = await db.inventoryItem.create({ data: { name, category, unit, minQuantity: min, maxQuantity: max, supplier } });
    item[name] = it.id;
    if (qty > 0) await db.$transaction((tx) => moveStock(tx, { itemId: it.id, change: qty, type: "OPENING", reason: "Opening stock", userId: owner.id }));
  }
  const purchases: [string, number, number, number][] = [
    ["Rice", 25, 160, -80], ["Maize flour", 24, 75, -75], ["Beans", 20, 140, -70], ["Cooking oil", 10, 320, -65],
    ["Beef", 8, 650, -60], ["Eggs", 90, 15, -55], ["Rice", 25, 162, -45], ["Sugar", 10, 180, -40],
    ["Beef", 6, 680, -35], ["Chicken", 6, 550, -30], ["Maize flour", 24, 78, -25], ["Eggs", 90, 16, -20],
    ["Vegetables (sukuma)", 15, 30, -14], ["Rice", 20, 165, -12], ["Bananas", 4, 150, -8], ["Beef", 6, 690, -6],
    ["Vegetables (sukuma)", 15, 30, -3], ["Eggs", 60, 16, -2], ["Tea leaves", 1, 900, -1],
  ];
  for (const [name, qty, cost, d] of purchases) {
    await recordPurchase(
      { itemId: item[name]!, quantity: qty, unitCost: cost, supplier: null, purchaseDate: addDays(today, d), reference: `RCPT-${Math.abs(d)}-${qty}`, notes: null },
      cook.id,
    );
  }
  // Usage, waste and a stock-count correction.
  for (const [name, qty] of [["Rice", 55], ["Maize flour", 50], ["Beans", 22], ["Cooking oil", 9], ["Beef", 22], ["Chicken", 6], ["Eggs", 220], ["Sugar", 9], ["Vegetables (sukuma)", 26], ["Bananas", 5], ["Dish soap", 2]] as const) {
    await db.$transaction((tx) => moveStock(tx, { itemId: item[name]!, change: -qty, type: "CONSUMPTION", reason: "Used for meals", userId: cook.id }));
  }
  await db.$transaction((tx) => moveStock(tx, { itemId: item["Eggs"]!, change: -6, type: "WASTE", reason: "Cracked tray", userId: cook.id }));
  await db.$transaction((tx) => moveStock(tx, { itemId: item["Bananas"]!, change: -1, type: "WASTE", reason: "Over-ripe", userId: cook.id }));
  await db.$transaction((tx) => moveStock(tx, { itemId: item["Salt"]!, change: 0.5, type: "ADJUSTMENT", reason: "Stock count correction", userId: owner.id }));
  // A purchase recorded against the wrong item, then voided by the owner.
  const wrong = await recordPurchase(
    { itemId: item["Sugar"]!, quantity: 5, unitCost: 185, supplier: "Naivas Wholesale", purchaseDate: addDays(today, -4), reference: "RCPT-WRONG", notes: "Should have been salt" },
    cook.id,
  );
  await voidPurchase(wrong.purchaseId, "Recorded against the wrong item", owner.id);

  // ── Kitchen expenses (3 months, every category, one voided) ──
  step("kitchen expenses");
  const expenses: ["FOOD" | "GAS" | "WATER" | "CLEANING_SUPPLIES" | "EQUIPMENT" | "TRANSPORT" | "OTHER", string, number, number][] = [
    ["GAS", "Gas refill 13kg", 3400, -85], ["WATER", "Water bowser delivery", 1500, -80], ["FOOD", "Bread (weekly)", 1800, -77],
    ["TRANSPORT", "Market transport", 600, -70], ["FOOD", "Bread (weekly)", 1800, -63], ["CLEANING_SUPPLIES", "Bleach and sponges", 950, -60],
    ["GAS", "Gas refill 13kg", 3400, -55], ["OTHER", "Kitchen apron replacement", 700, -50], ["FOOD", "Bread (weekly)", 1800, -49],
    ["WATER", "Water bowser delivery", 1500, -45], ["CLEANING_SUPPLIES", "Dish soap, sponges, bleach", 1250, -30], ["FOOD", "Bread (weekly)", 1800, -28],
    ["EQUIPMENT", "New cooking pot", 2800, -18], ["GAS", "Gas refill 13kg", 3400, -14], ["FOOD", "Bread (weekly)", 1800, -14],
    ["TRANSPORT", "Market transport", 500, -9], ["FOOD", "Bread (weekly)", 1800, -7], ["WATER", "Water bowser delivery", 1500, -5],
    ["FOOD", "Fruits (oranges)", 900, -2], ["EQUIPMENT", "Serving spoons (6)", 1200, -1],
  ];
  for (const [category, description, amount, d] of expenses) {
    await db.kitchenExpense.create({
      data: {
        category,
        description,
        amount,
        expenseDate: addDays(today, d),
        paymentMethod: amount > 2000 ? "MPESA" : "CASH",
        reference: amount > 2000 ? `S${(9300000 + Math.abs(d)).toString(36).toUpperCase()}X` : null,
        recordedById: cook.id,
      },
    });
  }
  await db.kitchenExpense.create({
    data: {
      category: "TRANSPORT",
      description: "Market transport",
      amount: 500,
      expenseDate: addDays(today, -9),
      paymentMethod: "CASH",
      recordedById: cook.id,
      voidedAt: new Date(),
      voidedById: owner.id,
      voidReason: "Duplicate of an existing entry",
    },
  });

  // ── Shopping requests: one of every status ──
  step("shopping requests");
  const req = (status: "PENDING" | "APPROVED" | "REJECTED" | "PURCHASED" | "CANCELLED", reason: string, priority: "LOW" | "NORMAL" | "HIGH" | "URGENT", daysAgo: number, lines: [string, number, string, number][], review?: string) =>
    db.shoppingRequest.create({
      data: {
        status,
        reason,
        priority,
        neededBy: addDays(today, 3 - daysAgo),
        requestedById: cook.id,
        createdAt: addDays(new Date(), -daysAgo),
        reviewedById: status === "PENDING" || status === "CANCELLED" ? null : owner.id,
        reviewedAt: status === "PENDING" || status === "CANCELLED" ? null : addDays(new Date(), -daysAgo + 1),
        reviewNote: review ?? null,
        items: { create: lines.map(([name, quantity, unit, estimatedCost]) => ({ name, quantity, unit, estimatedCost, inventoryItemId: item[name] ?? null })) },
      },
    });
  await req("PENDING", "Milk has run out and oil is low", "URGENT", 0, [["Milk", 20, "L", 1300], ["Cooking oil", 5, "L", 1600]]);
  await req("PENDING", "Weekend menu needs chicken", "HIGH", 1, [["Chicken", 4, "kg", 2200]]);
  await req("APPROVED", "Monthly restock", "NORMAL", 2, [["Rice", 10, "kg", 1650], ["Sugar", 2, "kg", 360]], "Approved — buy from the wholesaler.");
  await req("REJECTED", "Special dinner", "LOW", 6, [["Goat meat", 6, "kg", 4800]], "Not this month.");
  await req("CANCELLED", "Extra bread for visitors", "LOW", 10, [["Bread loaves", 10, "pcs", 650]]);
  const bought = await req("PURCHASED", "Running low on greens and eggs", "NORMAL", 4, [["Vegetables (sukuma)", 15, "bunch", 450], ["Eggs", 60, "pcs", 960]], "Approved.");
  await db.purchase.updateMany({ where: { reference: { in: ["RCPT-3-15", "RCPT-2-60"] } }, data: { shoppingRequestId: bought.id } });

  // ── Announcements: every audience, active and expired ──
  step("announcements & notifications");
  const ann = [
    { title: "Water outage on Saturday", message: "Nairobi Water will interrupt supply on Saturday from 8am to 2pm. Please store water on Friday evening.", priority: "HIGH" as const, audience: "ALL" as const, expiresAt: addDays(today, 5) },
    { title: "Room cleaning schedule", message: "Rooms 1 & 2: Monday and Thursday.\nRooms 3 & 4: Tuesday and Friday.\nPlease keep floors clear on your cleaning days.", priority: "NORMAL" as const, audience: "STUDENTS" as const, expiresAt: null },
    { title: "House meeting on Sunday", message: "All residents: house meeting at 6pm in the dining area to discuss quiet hours.", priority: "NORMAL" as const, audience: "STUDENTS" as const, expiresAt: addDays(today, 4) },
    { title: "Kitchen deep clean", message: "Staff: the kitchen will be deep cleaned on Wednesday afternoon. Plan dinner prep accordingly.", priority: "URGENT" as const, audience: "STAFF" as const, expiresAt: addDays(today, 7) },
    { title: "Fumigation completed", message: "The hostel was fumigated last week. Thank you for your cooperation.", priority: "LOW" as const, audience: "ALL" as const, expiresAt: addDays(today, -3) },
  ];
  for (const a of ann) {
    const created = await db.announcement.create({ data: { ...a, createdById: owner.id, publishAt: a.expiresAt && a.expiresAt < today ? addDays(today, -12) : new Date() } });
    if (!a.expiresAt || a.expiresAt > today) {
      await notifyRoles(db, a.audience === "STAFF" ? ["OWNER", "HOSTEL_MANAGER", "KITCHEN_STAFF"] : a.audience === "STUDENTS" ? ["STUDENT"] : ["OWNER", "HOSTEL_MANAGER", "KITCHEN_STAFF", "STUDENT"], {
        type: "ANNOUNCEMENT",
        title: a.title,
        message: a.message.slice(0, 300),
        link: "/me/announcements",
        dedupeKey: `announcement:${created.id}`,
      });
    }
  }

  // Daily rent job: overdue statuses, reminders (in-app + skipped SMS), staff summary.
  const r = await runRentReminders({ today, userId: owner.id });

  // Mark some older notifications as read so both states are visible.
  const older = await db.notification.findMany({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const half = older.slice(0, Math.floor(older.length / 2)).map((x) => x.id);
  if (half.length) await db.notification.updateMany({ where: { id: { in: half } }, data: { readAt: new Date() } });

  // ── Summary ──
  const counts = await Promise.all([
    db.room.count(), db.bed.count(), db.student.count(), db.rentInvoice.count(), db.rentPayment.count(), db.overnightStatus.count(),
    db.meal.count(), db.mealRecord.count(), db.inventoryItem.count(), db.purchase.count(), db.kitchenExpense.count(),
    db.shoppingRequest.count(), db.announcement.count(), db.notification.count(), db.activityLog.count(),
  ]);
  const labels = ["rooms", "beds", "students", "rent records", "payments", "overnight answers", "meals", "meal records", "stock items", "purchases", "expenses", "shopping requests", "announcements", "notifications", "activity log entries"];
  console.log("\nCreated:");
  labels.forEach((l, i) => console.log(`  ${String(counts[i]).padStart(4)} ${l}`));
  console.log(`  reminders: ${r.created} (${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed)`);
  console.log("\nTest logins:");
  console.log(owner.email === "owner@hostel.test" ? `  owner      owner@hostel.test / ${STAFF_PW}` : `  owner      ${owner.email ?? owner.phone} (your existing password)`);
  console.log(`  manager    manager@hostel.test / ${STAFF_PW}${manager.mustChangePassword ? " (asks for a new password at first sign-in)" : ""}`);
  console.log(`  kitchen    kitchen@hostel.test / ${STAFF_PW}${cook.mustChangePassword ? " (asks for a new password at first sign-in)" : ""}`);
  console.log(`  students   student1@hostel.test … student8@hostel.test / ${STUDENT_PW}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
