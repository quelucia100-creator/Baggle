import { describe, expect, it } from "vitest";
import { recurringDay, recurringFreeSlots, recurringLegacyWindow, recurringV3 } from "./party-availability";
import type { AvailabilityDay } from "./account-availability-model";
import type { MemberContext } from "@/components/planning/v3/member-model";
import { daySlots } from "@/components/planning/v3/time";
const rows: AvailabilityDay[] = [{ weekday: 2, busy: [18, 19, 48, 49], confirmed: true }];
const context: MemberContext = { availabilityMode: "calendar", candidateDates: ["2026-11-24"], now: Date.parse("2026-11-22T15:00:00Z"), minMinutes: 60, sharedTravel: false, groupArea: null, freeOnly: false };
describe("confirmed recurring schedules in private party drafts", () => {
  it("maps ISO weekdays without inventing unsaved or unconfirmed days", () => {
    expect(recurringDay(rows, "2026-11-24")?.weekday).toBe(2);
    expect(recurringFreeSlots(rows, "2026-11-25")).toBeNull();
    expect(recurringV3([{ ...rows[0], weekday: 2, busy: [], confirmed: false }], context)).toBeNull();
    expect(recurringV3(rows, { ...context, candidateDates: ["2026-11-24", "2026-11-25"] })).toBeNull();
  });
  it("preserves private busy gaps and next-day spillover without modifying source rows", () => {
    const original = JSON.stringify(rows);
    expect(recurringV3(rows, context)).toEqual({ days: { "2026-11-24": { busy: [18, 19, 48, 49], confirmed: true } } });
    expect(recurringFreeSlots(rows, "2026-11-24")).not.toContain(18);
    expect(recurringFreeSlots(rows, "2026-11-24")).not.toContain(48);
    expect(JSON.stringify(rows)).toBe(original);
  });
  it("uses only a genuine continuous future window for tonight instead of bridging busy gaps", () => {
    const available = [36, 37, 40, 41, 42, 43];
    const week: AvailabilityDay[] = [{ weekday: 2, busy: Array.from({ length: 60 }, (_, i) => i).filter((i) => !available.includes(i)), confirmed: true }];
    expect(recurringV3(week, { ...context, availabilityMode: "tonight", now: Date.parse("2026-11-24T22:00:00Z") })).toEqual({ departure: { kind: "at", at: "2026-11-25T01:00:00.000Z" }, returnBy: { kind: "at", at: "2026-11-25T03:00:00.000Z" } });
  });
  it("retains Sunday overnight slots and the legacy contract's midnight end", () => {
    const week: AvailabilityDay[] = [{ weekday: 7, busy: Array.from({ length: 60 }, (_, i) => i).filter((i) => i < 46 || i > 49), confirmed: true }];
    expect(recurringLegacyWindow(week, "2026-11-22", 60)).toEqual({ freeFrom: "23:00", freeTo: "01:00" });
    expect(recurringV3(week, { ...context, candidateDates: ["2026-11-22"] })).toEqual({ days: { "2026-11-22": { busy: week[0]?.busy, confirmed: true } } });
  });
  it("keeps DST mapping in civil half-hours and never fabricates a missing clock time", () => {
    const week: AvailabilityDay[] = [{ weekday: 7, busy: [4, 5], confirmed: true }];
    expect(recurringV3(week, { ...context, candidateDates: ["2027-03-14"] })).toEqual({ days: { "2027-03-14": { busy: [4, 5], confirmed: true } } });
    expect(daySlots("2027-03-14")[4]?.startMs).toBeNull();
  });
});