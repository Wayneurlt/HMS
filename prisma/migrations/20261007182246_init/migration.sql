-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'HOSTEL_MANAGER', 'KITCHEN_STAFF', 'STUDENT');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CHECKED_OUT');

-- CreateEnum
CREATE TYPE "BedStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "RentStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MPESA', 'CASH', 'BANK', 'OTHER');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('BEFORE_DUE', 'ON_DUE', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('IN_APP', 'SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "OvernightState" AS ENUM ('STAYING', 'AWAY');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'DINNER');

-- CreateEnum
CREATE TYPE "InventoryCategory" AS ENUM ('GRAINS', 'PROTEIN', 'DAIRY', 'VEGETABLES', 'FRUITS', 'BEVERAGES', 'CONDIMENTS', 'COOKING_FUEL', 'CLEANING', 'OTHER');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('OPENING', 'PURCHASE', 'CONSUMPTION', 'ADJUSTMENT', 'WASTE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ShoppingRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PURCHASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('FOOD', 'GAS', 'WATER', 'CLEANING_SUPPLIES', 'EQUIPMENT', 'TRANSPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'STUDENTS', 'STAFF');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('RENT_DUE_SOON', 'RENT_DUE_TODAY', 'RENT_OVERDUE', 'PAYMENT_RECEIVED', 'LOW_STOCK', 'OUT_OF_STOCK', 'SHOPPING_REQUEST_NEW', 'SHOPPING_REQUEST_APPROVED', 'SHOPPING_REQUEST_REJECTED', 'ANNOUNCEMENT', 'GENERAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "ipAddress" TEXT,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floor" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "BedStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "idNumber" TEXT,
    "photoUrl" TEXT,
    "status" "StudentStatus" NOT NULL DEFAULT 'PENDING',
    "monthlyRent" DECIMAL(12,2) NOT NULL,
    "rentDueDay" INTEGER NOT NULL DEFAULT 5,
    "moveInDate" DATE,
    "moveOutDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accommodation" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "activeStudentId" TEXT,
    "activeBedId" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "monthlyRent" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "checkedInById" TEXT,
    "checkedOutById" TEXT,
    "checkoutNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accommodation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentInvoice" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "accommodationId" TEXT,
    "periodMonth" DATE NOT NULL,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dueDate" DATE NOT NULL,
    "status" "RentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,

    CONSTRAINT "RentInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentPayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "RentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'IN_APP',
    "template" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "ruleId" TEXT,
    "type" "ReminderType" NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "error" TEXT,
    "scheduledFor" DATE NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvernightStatus" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "OvernightState" NOT NULL,
    "expectedReturnDate" DATE,
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OvernightStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meal" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "MealType" NOT NULL,
    "menu" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealRecord" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "expectedCount" INTEGER NOT NULL,
    "servedCount" INTEGER NOT NULL,
    "leftoverPortions" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealAttendance" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attended" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "InventoryCategory" NOT NULL DEFAULT 'OTHER',
    "unit" TEXT NOT NULL,
    "currentQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "minQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "maxQuantity" DECIMAL(12,3),
    "supplier" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "InventoryTransactionType" NOT NULL,
    "quantityChange" DECIMAL(12,3) NOT NULL,
    "balanceAfter" DECIMAL(12,3) NOT NULL,
    "reason" TEXT,
    "purchaseId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "supplier" TEXT,
    "purchaseDate" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "shoppingRequestId" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingRequest" (
    "id" TEXT NOT NULL,
    "reason" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "status" "ShoppingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "neededBy" DATE,
    "requestedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "estimatedCost" DECIMAL(12,2),
    "notes" TEXT,

    CONSTRAINT "ShoppingRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenExpense" (
    "id" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "expenseDate" DATE NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "KitchenExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL',
    "publishAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostelSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "hostelName" TEXT NOT NULL DEFAULT 'Student Hostel',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "defaultMonthlyRent" DECIMAL(12,2) NOT NULL DEFAULT 10000,
    "defaultRentDueDay" INTEGER NOT NULL DEFAULT 5,
    "prorateFirstMonth" BOOLEAN NOT NULL DEFAULT false,
    "breakfastTime" TEXT NOT NULL DEFAULT '07:00',
    "dinnerTime" TEXT NOT NULL DEFAULT '19:00',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostelSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_identifier_createdAt_idx" ON "LoginAttempt"("identifier", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ipAddress_createdAt_idx" ON "LoginAttempt"("ipAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Room_name_key" ON "Room"("name");

-- CreateIndex
CREATE INDEX "Bed_status_idx" ON "Bed"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Bed_roomId_label_key" ON "Bed"("roomId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");

-- CreateIndex
CREATE INDEX "Student_status_idx" ON "Student"("status");

-- CreateIndex
CREATE INDEX "Student_fullName_idx" ON "Student"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Accommodation_activeStudentId_key" ON "Accommodation"("activeStudentId");

-- CreateIndex
CREATE UNIQUE INDEX "Accommodation_activeBedId_key" ON "Accommodation"("activeBedId");

-- CreateIndex
CREATE INDEX "Accommodation_studentId_idx" ON "Accommodation"("studentId");

-- CreateIndex
CREATE INDEX "Accommodation_bedId_idx" ON "Accommodation"("bedId");

-- CreateIndex
CREATE INDEX "Accommodation_isActive_idx" ON "Accommodation"("isActive");

-- CreateIndex
CREATE INDEX "RentInvoice_status_idx" ON "RentInvoice"("status");

-- CreateIndex
CREATE INDEX "RentInvoice_dueDate_idx" ON "RentInvoice"("dueDate");

-- CreateIndex
CREATE INDEX "RentInvoice_periodMonth_idx" ON "RentInvoice"("periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "RentInvoice_studentId_periodMonth_key" ON "RentInvoice"("studentId", "periodMonth");

-- CreateIndex
CREATE INDEX "RentPayment_invoiceId_idx" ON "RentPayment"("invoiceId");

-- CreateIndex
CREATE INDEX "RentPayment_studentId_idx" ON "RentPayment"("studentId");

-- CreateIndex
CREATE INDEX "RentPayment_paidAt_idx" ON "RentPayment"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderRule_offsetDays_key" ON "ReminderRule"("offsetDays");

-- CreateIndex
CREATE INDEX "ReminderLog_status_idx" ON "ReminderLog"("status");

-- CreateIndex
CREATE INDEX "ReminderLog_createdAt_idx" ON "ReminderLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_invoiceId_ruleId_key" ON "ReminderLog"("invoiceId", "ruleId");

-- CreateIndex
CREATE INDEX "OvernightStatus_date_status_idx" ON "OvernightStatus"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OvernightStatus_studentId_date_key" ON "OvernightStatus"("studentId", "date");

-- CreateIndex
CREATE INDEX "Meal_date_idx" ON "Meal"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Meal_date_type_key" ON "Meal"("date", "type");

-- CreateIndex
CREATE UNIQUE INDEX "MealRecord_mealId_key" ON "MealRecord"("mealId");

-- CreateIndex
CREATE UNIQUE INDEX "MealAttendance_mealId_studentId_key" ON "MealAttendance"("mealId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_name_key" ON "InventoryItem"("name");

-- CreateIndex
CREATE INDEX "InventoryItem_category_idx" ON "InventoryItem"("category");

-- CreateIndex
CREATE INDEX "InventoryTransaction_itemId_createdAt_idx" ON "InventoryTransaction"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_type_createdAt_idx" ON "InventoryTransaction"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Purchase_purchaseDate_idx" ON "Purchase"("purchaseDate");

-- CreateIndex
CREATE INDEX "Purchase_itemId_idx" ON "Purchase"("itemId");

-- CreateIndex
CREATE INDEX "ShoppingRequest_status_createdAt_idx" ON "ShoppingRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ShoppingRequestItem_requestId_idx" ON "ShoppingRequestItem"("requestId");

-- CreateIndex
CREATE INDEX "KitchenExpense_expenseDate_idx" ON "KitchenExpense"("expenseDate");

-- CreateIndex
CREATE INDEX "KitchenExpense_category_idx" ON "KitchenExpense"("category");

-- CreateIndex
CREATE INDEX "Announcement_publishAt_expiresAt_idx" ON "Announcement"("publishAt", "expiresAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_idx" ON "ActivityLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_activeStudentId_fkey" FOREIGN KEY ("activeStudentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_activeBedId_fkey" FOREIGN KEY ("activeBedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentInvoice" ADD CONSTRAINT "RentInvoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentInvoice" ADD CONSTRAINT "RentInvoice_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentPayment" ADD CONSTRAINT "RentPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "RentInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentPayment" ADD CONSTRAINT "RentPayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentPayment" ADD CONSTRAINT "RentPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentPayment" ADD CONSTRAINT "RentPayment_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "RentInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReminderRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvernightStatus" ADD CONSTRAINT "OvernightStatus_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvernightStatus" ADD CONSTRAINT "OvernightStatus_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealRecord" ADD CONSTRAINT "MealRecord_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealRecord" ADD CONSTRAINT "MealRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealAttendance" ADD CONSTRAINT "MealAttendance_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealAttendance" ADD CONSTRAINT "MealAttendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_shoppingRequestId_fkey" FOREIGN KEY ("shoppingRequestId") REFERENCES "ShoppingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingRequest" ADD CONSTRAINT "ShoppingRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingRequest" ADD CONSTRAINT "ShoppingRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingRequestItem" ADD CONSTRAINT "ShoppingRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ShoppingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingRequestItem" ADD CONSTRAINT "ShoppingRequestItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenExpense" ADD CONSTRAINT "KitchenExpense_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenExpense" ADD CONSTRAINT "KitchenExpense_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
