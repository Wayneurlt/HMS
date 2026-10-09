-- Database-level guards that back up the application's validation.

ALTER TABLE "Student"
  ADD CONSTRAINT "Student_monthlyRent_nonneg" CHECK ("monthlyRent" >= 0),
  ADD CONSTRAINT "Student_rentDueDay_range" CHECK ("rentDueDay" BETWEEN 1 AND 28);

ALTER TABLE "Accommodation"
  ADD CONSTRAINT "Accommodation_monthlyRent_nonneg" CHECK ("monthlyRent" >= 0),
  ADD CONSTRAINT "Accommodation_dates" CHECK ("endDate" IS NULL OR "endDate" >= "startDate"),
  ADD CONSTRAINT "Accommodation_active_consistency" CHECK (
    ("isActive" AND "activeBedId" = "bedId" AND "activeStudentId" = "studentId")
    OR (NOT "isActive" AND "activeBedId" IS NULL AND "activeStudentId" IS NULL)
  );

ALTER TABLE "RentInvoice"
  ADD CONSTRAINT "RentInvoice_amounts_nonneg" CHECK ("amountDue" >= 0 AND "amountPaid" >= 0),
  ADD CONSTRAINT "RentInvoice_not_overpaid" CHECK ("amountPaid" <= "amountDue");

ALTER TABLE "RentPayment"
  ADD CONSTRAINT "RentPayment_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_quantity_nonneg" CHECK ("currentQuantity" >= 0 AND "minQuantity" >= 0);

ALTER TABLE "InventoryTransaction"
  ADD CONSTRAINT "InventoryTransaction_balance_nonneg" CHECK ("balanceAfter" >= 0);

ALTER TABLE "Purchase"
  ADD CONSTRAINT "Purchase_amounts" CHECK ("quantity" > 0 AND "unitCost" >= 0 AND "totalCost" >= 0);

ALTER TABLE "KitchenExpense"
  ADD CONSTRAINT "KitchenExpense_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "MealRecord"
  ADD CONSTRAINT "MealRecord_counts_nonneg" CHECK ("expectedCount" >= 0 AND "servedCount" >= 0 AND "leftoverPortions" >= 0);

ALTER TABLE "HostelSettings"
  ADD CONSTRAINT "HostelSettings_singleton" CHECK ("id" = 1),
  ADD CONSTRAINT "HostelSettings_dueDay_range" CHECK ("defaultRentDueDay" BETWEEN 1 AND 28);
