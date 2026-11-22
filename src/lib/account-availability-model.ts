import { z } from "zod";

export const AVAILABILITY_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const weekdaySchema = z.number().int().min(1).max(7);
export const availabilityDaySchema = z.object({
  weekday: weekdaySchema,
  busy: z.array(z.number().int().min(0).max(59)).max(60).refine((v) => new Set(v).size === v.length, "A time can only be selected once."),
  confirmed: z.boolean(),
}).strict();
export type AvailabilityDay = z.infer<typeof availabilityDaySchema>;

export function weekdayLabel(weekday: number) {
  return AVAILABILITY_WEEKDAYS[weekday - 1] ?? "Weekday";
}

export function validateAvailability(day: AvailabilityDay): string | null {
  const result = availabilityDaySchema.safeParse(day);
  if (!result.success) return result.error.issues[0]?.message ?? "Check your times.";
  if (!day.confirmed) return "Confirm this day before saving.";
  return null;
}

export function freeSlotCount(day: AvailabilityDay): number {
  if (!day.confirmed) return 0;
  return 60 - new Set(day.busy).size;
}