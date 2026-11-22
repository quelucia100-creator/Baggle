import { describe, expect, it } from "vitest";
import { budgetCost, openForSlot, solvePlans, travelCost, weatherForSlot } from "./solver";
import { localDay, wallTime } from "./tz";
import type { Snapshot, Venue } from "./types";

const area = { lat: 45.5, lng: -73.57 };
const snapshot: Snapshot = { config: { date: "2026-11-22", durationMin: 90, area, areaLabel: "Montreal", category: "park" },
  members: [
    { id: "11111111-1111-4111-8111-111111111111", budget: 0, maxTravelMin: 30, freeFrom: "18:00", freeTo: "22:00", origin: null },
    { id: "22222222-2222-4222-8222-222222222222", budget: 4, maxTravelMin: 30, freeFrom: "18:00", freeTo: "22:00", origin: null },
  ] };
const venue: Venue = { placeId: "free", name: "Test venue", category: "park", priceTier: 0, location: area, hours: null,
  outdoor: false, season: null, rating: 4, mapsUrl: "https://www.google.com/maps/search/?api=1&query=Montreal" };
describe("Planning fairness", () => {
  it("normalizes free-to-four budget overages by four", () => {
    expect(budgetCost(4, 0)).toBe(1); expect(budgetCost(1, 0)).toBe(.25);
    expect(budgetCost(0, 0)).toBe(0); expect(budgetCost(null, 0)).toBe(0); expect(budgetCost(0, 4)).toBe(0);
  });
  it("maximizes the least satisfied member instead of favoring a wealthy member", () => {
    const options = solvePlans(snapshot, [{ ...venue, placeId: "expensive", priceTier: 4, rating: 5 }, venue]).options;
    expect(options[0]?.venue.placeId).toBe("free"); expect(options[0]?.score).toBe(1);
    expect(options.find((p) => p.venue.placeId === "expensive")?.score).toBe(0);
  });
  it("clamps travel overage and uses four minutes per kilometre plus five", () => {
    expect(travelCost(area, area, 5)).toBe(0); expect(travelCost(area, { lat: 55, lng: -73 }, 5)).toBe(1);
    const approximatelyOneKm = { lat: area.lat + 1 / 111.1949266, lng: area.lng };
    expect(travelCost(area, approximatelyOneKm, 5)).toBeCloseTo(.8, 5);
  });
  it("uses member rough origin only when supplied", () => {
    const far = { lat: 50, lng: -73 };
    const result = solvePlans({ ...snapshot, members: snapshot.members.map((m) => ({ ...m, origin: far })) }, [venue]);
    expect(result.options[0]?.score).toBe(0);
  });
  it("reports the nonoverlapping outlier without including preferences in plans", () => {
    const odd = { ...snapshot.members[0], id: "33333333-3333-4333-8333-333333333333", budget: 1, maxTravelMin: 30, freeFrom: "09:00", freeTo: "10:00", origin: null };
    const result = solvePlans({ ...snapshot, members: [...snapshot.members, odd] }, [venue]);
    expect(result.options).toEqual([]); expect(result.outliers).toEqual([odd.id]);
    const plan = solvePlans(snapshot, [venue]).options[0];
    expect(plan && Object.keys(plan)).not.toContain("members");
  });
  it("keeps midnight availability on the following Montreal day", () => {
    const result = solvePlans({ ...snapshot, members: snapshot.members.map((m) => ({ ...m, freeFrom: "21:00", freeTo: "01:00" })) }, [venue]);
    expect(result.options).toHaveLength(6); expect(result.options[0]?.startAt).toBe("2026-11-23T02:00:00.000Z");
    expect(result.options.at(-1)?.endAt).toBe("2026-11-23T06:00:00.000Z");
  });
  it("handles previous-day opening hours closing at 02:00", () => {
    const open = { ...venue, hours: { "0": [{ open: "21:00", close: "02:00" }] } };
    expect(openForSlot(open, wallTime("2026-11-23", "00:00"), wallTime("2026-11-23", "01:30"))).toBe(true);
    expect(openForSlot(open, wallTime("2026-11-23", "01:00"), wallTime("2026-11-23", "02:30"))).toBe(false);
  });
  it("requires continuous opening coverage and flags unknown hours", () => {
    const closed = { ...venue, hours: { "0": [{ open: "18:00", close: "19:00" }, { open: "19:30", close: "22:00" }] } };
    expect(openForSlot(closed, wallTime(snapshot.config.date, "18:30"), wallTime(snapshot.config.date, "20:00"))).toBe(false);
    expect(solvePlans(snapshot, [venue]).options[0]?.hoursUnknown).toBe(true);
    expect(solvePlans(snapshot, [{ ...venue, hours: {} }]).options).toEqual([]);
  });
  it("drops winter venues in July and summer venues in November", () => {
    expect(solvePlans({ ...snapshot, config: { ...snapshot.config, date: "2026-07-22" } }, [{ ...venue, season: "winter" }]).options).toEqual([]);
    expect(solvePlans(snapshot, [{ ...venue, season: "summer" }]).options).toEqual([]);
  });
  it("penalizes rain later in a slot, keeping indoor venues ahead", () => {
    const forecast = [{ at: "2026-11-23T00:00:00Z", temperature: 10, precipitation: 80, code: 61 }];
    const singleSlot = { ...snapshot, members: snapshot.members.map((m) => ({ ...m, freeTo: "19:30" })) };
    const options = solvePlans(singleSlot, [{ ...venue, placeId: "outdoor", outdoor: true }, venue], forecast).options;
    expect(options[0]?.venue.placeId).toBe("free"); expect(options[1]?.score).toBe(.5);
  });
  it("uses extreme-temperature penalty and neutral unavailable forecast", () => {
    const start = wallTime(snapshot.config.date, "18:00");
    expect(weatherForSlot({ ...venue, outdoor: true }, start, start + 90 * 60000, [{ at: new Date(start).toISOString(), temperature: -11, precipitation: 0, code: 0 }]).penalty).toBe(.4);
    expect(weatherForSlot({ ...venue, outdoor: true }, start, start + 90 * 60000, []).penalty).toBe(0);
  });
  it("breaks equal scores by mean satisfaction before earliest start and rating", () => {
    const mixed = { ...snapshot, members: snapshot.members.map((m) => ({ ...m, budget: 4, maxTravelMin: 5, origin: m.budget === 0 ? { lat: 50, lng: -73 } : null })) };
    const options = solvePlans(mixed, [{ ...venue, placeId: "far", location: { lat: 49, lng: -73 }, rating: 5 }, venue]).options;
    expect(options[0]?.venue.placeId).toBe("free");
    const tied = solvePlans(snapshot, [{ ...venue, placeId: "b" }, { ...venue, placeId: "a" }, { ...venue, placeId: "rated", rating: 5 }]).options;
    expect(tied.slice(0, 3).map((p) => p.venue.placeId)).toEqual(["rated", "a", "b"]);
    expect(tied[2]?.startAt).toBe(tied[0]?.startAt); expect(tied[3]?.startAt).not.toBe(tied[0]?.startAt);
  });
  it("caps stored ranking at 20 privacy-safe options", () => {
    expect(solvePlans(snapshot, Array.from({ length: 30 }, (_, i) => ({ ...venue, placeId: String(i) }))).options).toHaveLength(20);
  });
  it("uses Montreal daylight saving and rejects ambiguous or missing civil times", () => {
    expect(wallTime("2026-07-22", "18:00")).toBe(Date.parse("2026-07-22T22:00:00Z"));
    expect(localDay(wallTime("2026-11-22", "18:00")).weekday).toBe(0);
    expect(() => wallTime("2026-03-08", "02:30")).toThrow(); expect(() => wallTime("2026-11-01", "01:30")).toThrow();
  });
});