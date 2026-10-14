/**
 * Meal schedule (client-safe): breakfast and dinner every day, plus lunch on Saturdays and
 * Sundays. Every page that lists a day's meals uses mealsFor() so the rule lives in one place.
 */
import type { MealType } from "@prisma/client";

export const MEAL_ORDER: MealType[] = ["BREAKFAST", "LUNCH", "DINNER"];

export const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
};

/** Saturday or Sunday, for a date-only value (00:00 UTC of the hostel day). */
export function isWeekend(day: Date): boolean {
  const d = day.getUTCDay();
  return d === 0 || d === 6;
}

/** The meals served on a given day, in serving order. */
export function mealsFor(day: Date): MealType[] {
  return isWeekend(day) ? ["BREAKFAST", "LUNCH", "DINNER"] : ["BREAKFAST", "DINNER"];
}

export function isMealServedOn(type: MealType, day: Date): boolean {
  return mealsFor(day).includes(type);
}

/** Short description of the schedule for public/info text. */
export const MEAL_SCHEDULE_TEXT = "2 meals on weekdays, 3 at weekends";
