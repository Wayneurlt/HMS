/**
 * Development seed. Creates demo users, rooms, students, rent, meals and kitchen data
 * by calling the same services the app uses, so the data follows the business rules.
 *
 *   npm run db:seed            # refuses to run if users already exist
 *   SEED_FORCE=1 npm run db:seed
 *   npm run db:reset           # drop everything, re-migrate and re-seed
 *
 * Demo passwords are for local development only. Never seed a production database.
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { addDays, monthStart, today as todayFn, addMonths } from "@/lib/dates";
import { checkInStudent, checkOutStudent } from "@/lib/services/accommodation";
import { recordPayment } from "@/lib/services/rent";
import { moveStock, recordPurchase } from "@/lib/services/inventory";
import { ensureDefaultReminderRules, runRentReminders } from "@/lib/services/reminders";
import { mealExpectation } from "@/lib/services/attendance";
import type { InventoryCategory, MealType } from "@prisma/client";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production.");
  const existing = await db.user.count();
  if (existing > 0 && !process.env.SEED_FORCE) {
    console.log("Database already has users — skipping seed. Use `npm run db:reset` to start fresh.");
    return;
  }

  const today = todayFn();
  console.log(`Seeding demo data (today = ${today.toISOString().slice(0, 10)})…`);

  await db.hostelSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, hostelName: "Greenview Hostel", address: "Kilimani, Nairobi", phone: "0700000000", defaultMonthlyRent: 10000, defaultRentDueDay: 5 },
  });
  await ensureDefaultReminderRules();

  // ── Users ──
  const staffPw = await hashPassword("Password123");
  const studentPw = await hashPassword("Student123");
  const owner = await db.user.create({ data: { name: "Daniel Mwangi", email: "owner@hostel.test", phone: "0711000001", passwordHash: staffPw, role: "OWNER" } });
  await db.user.create({ data: { name: "Grace Wanjiru", email: "manager@hostel.test", phone: "0711000002", passwordHash: staffPw, role: "HOSTEL_MANAGER" } });
  const cook = await db.user.create({ data: { name: "Peter Otieno", email: "kitchen@hostel.test", phone: "0711000003", passwordHash: staffPw, role: "KITCHEN_STAFF" } });

  // ── Rooms & beds (3 rooms, 10 beds) ──
  const layout: [string, number][] = [["Room 1", 4], ["Room 2", 3], ["Room 3", 3]];
  const beds: { id: string; room: string; label: string }[] = [];
  for (const [name, count] of layout) {
    const room = await db.room.create({ data: { name, floor: name === "Room 3" ? "First floor" : "Ground floor" } });
    for (let i = 1; i <= count; i++) {
      const bed = await db.bed.create({ data: { roomId: room.id, label: `Bed ${i}` } });
      beds.push({ id: bed.id, room: name, label: bed.label });
    }
  }
  await db.bed.update({ where: { id: beds[9]!.id }, data: { status: "MAINTENANCE", notes: "Broken bed frame — awaiting repair" } });

  // ── Students ──
  const m = (offset: number, day: number) => {
    const s = addMonths(monthStart(today), offset);
    return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), day));
  };
  const people = [
    { fullName: "Brian Kamau", phone: "0722100001", bed: 0, start: m(-3, 1), rent: 10000 },
    { fullName: "Kevin Ochieng", phone: "0722100002", bed: 1, start: m(-3, 1), rent: 10000 },
    { fullName: "Samuel Kiprono", phone: "0722100003", bed: 2, start: m(-2, 3), rent: 10000 },
    { fullName: "Dennis Mutua", phone: "0722100004", bed: 4, start: m(-2, 10), rent: 9500 },
    { fullName: "Felix Njoroge", phone: "0722100005", bed: 5, start: m(-1, 1), rent: 10000 },
    { fullName: "Allan Wekesa", phone: "0722100006", bed: 7, start: m(0, 1), rent: 11000 },
  ];
  const students: { id: string; userId: string; fullName: string }[] = [];
  for (const [i, p] of people.entries()) {
    const user = await db.user.create({
      data: { name: p.fullName, email: `student${i + 1}@hostel.test`, phone: p.phone, passwordHash: studentPw, role: "STUDENT" },
    });
    const s = await db.student.create({
      data: {
        userId: user.id,
        fullName: p.fullName,
        phone: p.phone,
        email: `student${i + 1}@hostel.test`,
        emergencyContactName: `Parent of ${p.fullName.split(" ")[0]}`,
        emergencyContactPhone: `0733${String(200000 + i)}`,
        idNumber: String(30000000 + i * 1111),
        monthlyRent: p.rent,
        rentDueDay: 5,
        status: "PENDING",
        notes: i === 3 ? "Prefers lower bunk." : null,
      },
    });
    await checkInStudent({ studentId: s.id, bedId: beds[p.bed]!.id, startDate: p.start, monthlyRent: p.rent, rentDueDay: 5 }, owner.id);
    students.push({ id: s.id, userId: user.id, fullName: p.fullName });
  }

  // A pending applicant (no bed yet) and a past resident (checked out).
  await db.student.create({
    data: { fullName: "Joseph Kariuki", phone: "0722100007", email: "joseph.k@example.com", monthlyRent: 10000, rentDueDay: 5, status: "PENDING", notes: "Viewing next week." },
  });
  const past = await db.student.create({
    data: { fullName: "Victor Omondi", phone: "0722100008", monthlyRent: 10000, rentDueDay: 5, status: "PENDING" },
  });
  await checkInStudent({ studentId: past.id, bedId: beds[3]!.id, startDate: m(-5, 1), monthlyRent: 10000, rentDueDay: 5 }, owner.id);

  // ── Rent payments: paid / partial / overdue mix ──
  const pay = async (studentId: string, fraction: number, months: "all" | "past") => {
    const invoices = await db.rentInvoice.findMany({ where: { studentId, voidedAt: null }, orderBy: { periodMonth: "asc" } });
    for (const inv of invoices) {
      const isCurrent = inv.periodMonth.getTime() === monthStart(today).getTime();
      if (months === "past" && isCurrent) continue;
      const amount = Math.round(Number(inv.amountDue) * (isCurrent ? fraction : 1));
      if (amount <= 0) continue;
      await recordPayment(
        {
          invoiceId: inv.id,
          amount,
          paidAt: new Date(Math.min(addDays(inv.dueDate, -2).getTime(), today.getTime())),
          method: amount % 2 === 0 ? "MPESA" : "CASH",
          reference: `Q${inv.id.slice(-8).toUpperCase()}`,
          notes: null,
        },
        owner.id,
      );
    }
  };
  await pay(students[0]!.id, 1, "all"); // fully paid
  await pay(students[1]!.id, 0.6, "all"); // partial this month (overdue after the 5th)
  await pay(students[2]!.id, 0, "past"); // this month unpaid
  // students[3]: last month unpaid too → overdue history
  const s3 = await db.rentInvoice.findMany({ where: { studentId: students[3]!.id }, orderBy: { periodMonth: "asc" } });
  if (s3[0]) await recordPayment({ invoiceId: s3[0].id, amount: Number(s3[0].amountDue), paidAt: s3[0].dueDate, method: "BANK", reference: "BNK-1001", notes: null }, owner.id);
  await pay(students[4]!.id, 1, "all");
  await checkOutStudent({ studentId: past.id, moveOutDate: m(-2, 28), notes: "Moved closer to campus." }, owner.id);
  await pay(past.id, 1, "all"); // only the months that remain (later months were voided at check-out)

  // ── Overnight: last 7 nights and the next 5 ──
  for (let d = -7; d <= 5; d++) {
    const night = addDays(today, d);
    for (const [i, s] of students.entries()) {
      const stay = await db.accommodation.findFirst({ where: { studentId: s.id, startDate: { lte: night }, OR: [{ endDate: null }, { endDate: { gt: night } }] } });
      if (!stay) continue;
      let status: "STAYING" | "AWAY" | null = "STAYING";
      if (d >= 0 && d <= 2 && (i === 1 || i === 4)) status = "AWAY";
      else if (d < 0 && (d + i) % 5 === 0) status = "AWAY";
      else if (d > 1 && i % 2 === 0) status = null; // not responded yet
      if (!status) continue;
      await db.overnightStatus.create({
        data: {
          studentId: s.id,
          date: night,
          status,
          expectedReturnDate: status === "AWAY" && d >= 0 ? addDays(today, 3) : null,
          note: status === "AWAY" && d >= 0 ? "Home for the weekend" : null,
          updatedById: s.userId,
        },
      });
    }
  }

  // ── Meals: past 14 days → next 7 days ──
  const breakfasts = ["Tea, bread, eggs", "Tea, mandazi, sausages", "Porridge, bread, bananas", "Tea, chapati, eggs", "Cocoa, bread, boiled eggs"];
  const dinners = ["Ugali, beef stew, sukuma wiki", "Rice, beans, cabbage", "Chapati, ndengu, kachumbari", "Pilau, kachumbari", "Ugali, fried fish, greens", "Githeri, avocado", "Rice, chicken stew, vegetables"];
  for (let d = -14; d <= 7; d++) {
    const date = addDays(today, d);
    for (const type of ["BREAKFAST", "DINNER"] as MealType[]) {
      const list = type === "BREAKFAST" ? breakfasts : dinners;
      const meal = await db.meal.create({
        data: { date, type, menu: list[(d + 14) % list.length]!, createdById: owner.id },
      });
      if (d < 0) {
        const exp = await mealExpectation(date, type);
        const served = Math.max(0, exp.expected - ((d + 14) % 3 === 0 ? 1 : 0));
        await db.mealRecord.create({
          data: {
            mealId: meal.id,
            expectedCount: exp.expected,
            servedCount: served,
            leftoverPortions: (d + 14) % 4 === 0 ? 1.5 : (d + 14) % 3 === 0 ? 1 : 0,
            recordedById: cook.id,
          },
        });
      }
    }
  }

  // ── Kitchen inventory ──
  const items: [string, InventoryCategory, string, number, number, number, string][] = [
    ["Rice", "GRAINS", "kg", 25, 10, 50, "Naivas Wholesale"],
    ["Maize flour", "GRAINS", "kg", 18, 10, 40, "Naivas Wholesale"],
    ["Wheat flour", "GRAINS", "kg", 6, 5, 20, "Naivas Wholesale"],
    ["Cooking oil", "CONDIMENTS", "L", 3, 4, 20, "Naivas Wholesale"],
    ["Sugar", "CONDIMENTS", "kg", 8, 3, 15, "Naivas Wholesale"],
    ["Milk", "DAIRY", "L", 0, 5, 30, "Brookside Depot"],
    ["Eggs", "PROTEIN", "pcs", 60, 30, 180, "Kamau Poultry"],
    ["Beef", "PROTEIN", "kg", 4, 3, 10, "City Butchery"],
    ["Vegetables (sukuma)", "VEGETABLES", "bunch", 6, 5, 20, "Marikiti Market"],
    ["Salt", "CONDIMENTS", "kg", 2, 1, 5, "Naivas Wholesale"],
    ["Tea leaves", "BEVERAGES", "kg", 1.5, 1, 5, "Naivas Wholesale"],
    ["Gas (13kg cylinder)", "COOKING_FUEL", "cylinder", 1, 1, 3, "Total Gas"],
  ];
  const itemIds: Record<string, string> = {};
  for (const [name, category, unit, qty, min, max, supplier] of items) {
    const item = await db.inventoryItem.create({ data: { name, category, unit, minQuantity: min, maxQuantity: max, supplier } });
    itemIds[name] = item.id;
    if (qty > 0) await db.$transaction((tx) => moveStock(tx, { itemId: item.id, change: qty, type: "OPENING", reason: "Opening stock", userId: owner.id }));
  }
  // Purchases spread over the last two months.
  const purchases: [string, number, number, number][] = [
    ["Rice", 25, 160, -40], ["Maize flour", 24, 75, -38], ["Cooking oil", 10, 320, -35], ["Beef", 8, 650, -30],
    ["Eggs", 90, 15, -25], ["Rice", 20, 165, -12], ["Sugar", 10, 180, -10], ["Beef", 6, 680, -6],
    ["Vegetables (sukuma)", 15, 30, -3], ["Eggs", 60, 16, -2], ["Tea leaves", 1, 900, -1],
  ];
  for (const [name, qty, cost, dayOffset] of purchases) {
    await recordPurchase(
      { itemId: itemIds[name]!, quantity: qty, unitCost: cost, supplier: null, purchaseDate: addDays(today, dayOffset), reference: `RCPT-${Math.abs(dayOffset)}${qty}`, notes: null },
      cook.id,
    );
  }
  // Consumption
  for (const [name, qty] of [["Rice", 30], ["Maize flour", 20], ["Cooking oil", 9], ["Beef", 9], ["Eggs", 100], ["Sugar", 5], ["Vegetables (sukuma)", 12]] as const) {
    await db.$transaction((tx) => moveStock(tx, { itemId: itemIds[name]!, change: -qty, type: "CONSUMPTION", reason: "Used for meals", userId: cook.id }));
  }

  // ── Kitchen expenses ──
  const expenses: ["FOOD" | "GAS" | "WATER" | "CLEANING_SUPPLIES" | "EQUIPMENT" | "TRANSPORT" | "OTHER", string, number, number][] = [
    ["GAS", "Gas refill 13kg", 3400, -45], ["WATER", "Water bowser delivery", 1500, -40], ["TRANSPORT", "Market transport", 600, -38],
    ["CLEANING_SUPPLIES", "Dish soap, sponges, bleach", 1250, -30], ["FOOD", "Bread (weekly)", 1800, -21], ["EQUIPMENT", "New cooking pot", 2800, -18],
    ["GAS", "Gas refill 13kg", 3400, -14], ["FOOD", "Bread (weekly)", 1800, -14], ["TRANSPORT", "Market transport", 500, -9],
    ["FOOD", "Bread (weekly)", 1800, -7], ["WATER", "Water bowser delivery", 1500, -5], ["FOOD", "Fruits (bananas)", 900, -2],
  ];
  for (const [category, description, amount, d] of expenses) {
    await db.kitchenExpense.create({
      data: { category, description, amount, expenseDate: addDays(today, d), paymentMethod: amount > 2000 ? "MPESA" : "CASH", recordedById: cook.id },
    });
  }

  // ── Shopping requests ──
  await db.shoppingRequest.create({
    data: {
      reason: "Running low ahead of the weekend",
      priority: "HIGH",
      requestedById: cook.id,
      neededBy: addDays(today, 2),
      items: { create: [
        { name: "Milk", inventoryItemId: itemIds["Milk"], quantity: 20, unit: "L", estimatedCost: 1300 },
        { name: "Cooking oil", inventoryItemId: itemIds["Cooking oil"], quantity: 5, unit: "L", estimatedCost: 1600 },
      ] },
    },
  });
  await db.shoppingRequest.create({
    data: {
      reason: "Monthly restock",
      priority: "NORMAL",
      status: "APPROVED",
      requestedById: cook.id,
      reviewedById: owner.id,
      reviewedAt: addDays(new Date(), -1),
      reviewNote: "Approved — buy from the wholesaler.",
      items: { create: [{ name: "Rice", inventoryItemId: itemIds["Rice"], quantity: 10, unit: "kg", estimatedCost: 1650 }, { name: "Sugar", inventoryItemId: itemIds["Sugar"], quantity: 2, unit: "kg", estimatedCost: 360 }] },
    },
  });
  await db.shoppingRequest.create({
    data: {
      reason: "Special dinner",
      priority: "LOW",
      status: "REJECTED",
      requestedById: cook.id,
      reviewedById: owner.id,
      reviewedAt: addDays(new Date(), -5),
      reviewNote: "Not this month.",
      items: { create: [{ name: "Chicken", quantity: 6, unit: "pcs", estimatedCost: 4800 }] },
    },
  });

  // ── Announcements ──
  await db.announcement.createMany({
    data: [
      { title: "Water outage on Saturday", message: "Nairobi Water will interrupt supply on Saturday from 8am to 2pm. Please store water on Friday evening.", priority: "HIGH", createdById: owner.id, expiresAt: addDays(today, 5) },
      { title: "Room cleaning schedule", message: "Rooms 1 & 2: Monday and Thursday.\nRoom 3: Tuesday and Friday.\nPlease keep floors clear on your cleaning days.", priority: "NORMAL", createdById: owner.id },
    ],
  });

  const r = await runRentReminders({ today });
  console.log(`Reminders: ${r.created} created (${r.sent} sent). Invoices generated: ${r.invoicesGenerated}.`);
  console.log("\nDemo logins (development only):");
  console.log("  owner@hostel.test / Password123");
  console.log("  manager@hostel.test / Password123");
  console.log("  kitchen@hostel.test / Password123");
  console.log("  student1@hostel.test … student6@hostel.test / Student123");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
