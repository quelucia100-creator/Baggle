import { describe, expect, it } from "vitest";
import { AVAILABILITY_WEEKDAYS, availabilityDaySchema, freeSlotCount, validateAvailability, weekdayLabel } from "./account-availability-model";

describe("Private recurring weekly availability", () => {
  it("uses ISO weekdays Monday through Sunday, not calendar dates", () => {
    expect(AVAILABILITY_WEEKDAYS).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    expect(weekdayLabel(1)).toBe("Monday");
    expect(weekdayLabel(7)).toBe("Sunday");
    for (const weekday of [0, 8, 1.5]) expect(availabilityDaySchema.safeParse({ weekday, busy: [], confirmed: true }).success).toBe(false);
    expect(availabilityDaySchema.safeParse({ date: "2026-11-22", busy: [], confirmed: true }).success).toBe(false);
    expect(availabilityDaySchema.safeParse({ weekday: 1, date: "2026-11-22", busy: [], confirmed: true }).success).toBe(false);
  });
  it("requires explicit day confirmation before save", () => {
    expect(validateAvailability({ weekday: 1, busy: [], confirmed: false })).toBe("Confirm this day before saving.");
  });
  it("keeps unconfirmed days unavailable", () => {
    expect(freeSlotCount({ weekday: 1, busy: [], confirmed: false })).toBe(0);
  });
  it("includes next-day spillover in 30-minute slots", () => {
    const day = { weekday: 7, busy: [48, 59], confirmed: true };
    expect(availabilityDaySchema.safeParse(day).success).toBe(true);
    expect(freeSlotCount(day)).toBe(58);
  });
  it("rejects duplicate and out-of-grid slots", () => {
    expect(availabilityDaySchema.safeParse({ weekday: 1, busy: [60], confirmed: true }).success).toBe(false);
    expect(availabilityDaySchema.safeParse({ weekday: 1, busy: [1, 1], confirmed: true }).success).toBe(false);
  });
  it("keeps every weekday available without expiry or date-horizon validation", () => {
    for (let weekday = 1; weekday <= 7; weekday++) {
      expect(validateAvailability({ weekday, busy: [], confirmed: true })).toBeNull();
      expect(freeSlotCount({ weekday, busy: [], confirmed: true })).toBe(60);
    }
  });
});