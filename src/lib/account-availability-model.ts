import { z } from "zod";
import { daySlots, inHorizon, isPastSlot, isValidIsoDate, todayIn } from "@/components/planning/v3/time";

export const availabilityDaySchema = z.object({
  date: z.string().refine(isValidIsoDate, "Choose a valid date."),
  busy: z.array(z.number().int().min(0).max(59)).max(60).refine((v) => new Set(v).size === v.length, "A time can only be selected once."),
  confirmed: z.boolean(),
});
export type AvailabilityDay = z.infer<typeof availabilityDaySchema>;

export function validateAvailability(day: AvailabilityDay, now: number): string | null {
  const result = availabilityDaySchema.safeParse(day);
  if (!result.success) return result.error.issues[0]?.message ?? "Check your times.";
  if (!inHorizon(day.date, todayIn(now))) return "Choose a date within the next two weeks.";
  if (!day.confirmed) return "Confirm this day before saving.";
  return null;
}

export function freeSlotCount(day: AvailabilityDay, now: number): number {
  if (!day.confirmed) return 0;
  const busy = new Set(day.busy);
  return daySlots(day.date).filter((slot) => slot.startMs !== null && !isPastSlot(slot, now) && !busy.has(slot.index)).length;
}