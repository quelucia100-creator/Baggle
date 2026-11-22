import { describe, expect, it } from "vitest";
import { availabilityDaySchema, availabilityWeek, freeSlotCount, validateAvailability } from "./account-availability-model";
import { todayIn } from "@/components/planning/v3/time";

const now = Date.parse("2026-11-22T05:00:00Z");
describe("Private account availability matches the guest calendar", () => {
  it("lists Monday through Sunday in the chosen Montreal calendar week", () => {
    expect(availabilityWeek("2026-11-22", 0)).toEqual([
      { label: "Monday", date: "2026-11-16" }, { label: "Tuesday", date: "2026-11-17" },
      { label: "Wednesday", date: "2026-11-18" }, { label: "Thursday", date: "2026-11-19" },
      { label: "Friday", date: "2026-11-20" }, { label: "Saturday", date: "2026-11-21" },
      { label: "Sunday", date: "2026-11-22" },
    ]);
    expect(availabilityWeek("2026-11-22", 1)[0]).toEqual({ label: "Monday", date: "2026-11-23" });
  });
  it("uses Montreal dates rather than UTC at midnight", () => {
    expect(todayIn(Date.parse("2026-11-22T02:00:00Z"))).toBe("2026-11-21");
  });
  it("requires explicit day confirmation before save", () => {
    expect(validateAvailability({ date: "2026-11-22", busy: [], confirmed: false }, now)).toBe("Confirm this day before saving.");
  });
  it("keeps unconfirmed days unavailable", () => {
    expect(freeSlotCount({ date: "2026-11-22", busy: [], confirmed: false }, now)).toBe(0);
  });
  it("includes next-day spillover in 30-minute slots", () => {
    const day = { date: "2026-11-22", busy: [48, 59], confirmed: true };
    expect(availabilityDaySchema.safeParse(day).success).toBe(true);
    expect(freeSlotCount(day, now)).toBe(58);
  });
  it("rejects duplicate and out-of-grid slots", () => {
    expect(availabilityDaySchema.safeParse({ date: "2026-11-22", busy: [60], confirmed: true }).success).toBe(false);
    expect(availabilityDaySchema.safeParse({ date: "2026-11-22", busy: [1, 1], confirmed: true }).success).toBe(false);
  });
  it("keeps the guest two-week date horizon", () => {
    expect(validateAvailability({ date: "2026-12-06", busy: [], confirmed: true }, now)).toBeNull();
    expect(validateAvailability({ date: "2026-12-07", busy: [], confirmed: true }, now)).toBe("Choose a date within the next two weeks.");
  });
});