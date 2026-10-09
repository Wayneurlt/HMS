/** Client-safe enum lists for kitchen forms and filters (mirror prisma/schema.prisma). */
import { label } from "@/lib/format";

export const INVENTORY_CATEGORIES = [
  "GRAINS",
  "PROTEIN",
  "DAIRY",
  "VEGETABLES",
  "FRUITS",
  "BEVERAGES",
  "CONDIMENTS",
  "COOKING_FUEL",
  "CLEANING",
  "OTHER",
] as const;

export const EXPENSE_CATEGORIES = [
  "FOOD",
  "GAS",
  "WATER",
  "CLEANING_SUPPLIES",
  "EQUIPMENT",
  "TRANSPORT",
  "OTHER",
] as const;

export const PAYMENT_METHODS = ["MPESA", "CASH", "BANK", "OTHER"] as const;

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export const SHOPPING_STATUSES = ["PENDING", "APPROVED", "PURCHASED", "REJECTED", "CANCELLED"] as const;

export const toOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: label(v) }));
