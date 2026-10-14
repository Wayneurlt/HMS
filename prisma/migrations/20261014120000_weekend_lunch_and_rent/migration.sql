-- Lunch is served on Saturdays and Sundays (breakfast and dinner every day).
ALTER TYPE "MealType" ADD VALUE 'LUNCH' BEFORE 'DINNER';

-- Lunch serving time, and the hostel's standard monthly rent (KES 18,000) as the default.
ALTER TABLE "HostelSettings" ADD COLUMN "lunchTime" TEXT NOT NULL DEFAULT '13:00',
ALTER COLUMN "defaultMonthlyRent" SET DEFAULT 18000;
