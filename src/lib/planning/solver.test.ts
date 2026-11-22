import { describe, expect, it } from "vitest";
import { openForSlot, solvePlans, weatherForSlot } from "./solver";
import { localDay, wallTime } from "./tz";
import type { Snapshot, Venue } from "./types";

const area = { lat: 45.5, lng: -73.57 };
const snapshot: Snapshot = {
  config: { date: "2026-11-22", durationMin: 90, area, areaLabel: "Montreal", category: "park" },
  members: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      budget: 0,
      maxTravelMin: 30,
      freeFrom: "18:00",
      freeTo: "22:00",
      origin: null,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      budget: 4,
      maxTravelMin: 30,
      freeFrom: "18:00",
      freeTo: "22:00",
      origin: null,
    },
  ],
};
const venue: Venue = {
  placeId: "free",
  name: "Test venue",
  category: "park",
  priceTier: 0,
  location: area,
  hours: { 0: [{ open: "06:00", close: "24:00" }], 1: [{ open: "00:00", close: "02:00" }] },
  outdoor: false,
  season: null,
  rating: 4,
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Montreal",
};
describe("Planning feasibility and ranking", () => {
  it.each([1, 4, null, -1, 0.5])(
    "rules out an infeasible or unverified price tier of %s for a zero budget",
    (priceTier) => {
      const options = solvePlans(snapshot, [
        { ...venue, placeId: "over-budget", priceTier, rating: 5 },
        venue,
      ]).options;
      expect(options.length).toBeGreaterThan(0);
      expect(new Set(options.map((option) => option.venue.placeId))).toEqual(new Set(["free"]));
    },
  );
  it("accepts a verified price equal to the smallest member budget", () => {
    const paid = {
      ...snapshot,
      members: snapshot.members.map((member) => ({ ...member, budget: 2 })),
    };
    expect(solvePlans(paid, [{ ...venue, priceTier: 2 }]).options[0]?.venue.priceTier).toBe(2);
  });
  it("enforces every travel limit using the configured area when no origin is shared", () => {
    const short = {
      ...snapshot,
      members: [snapshot.members[0]!, { ...snapshot.members[1]!, maxTravelMin: 5 }],
    };
    const farther = { ...venue, placeId: "farther", location: { ...area, lat: area.lat + 0.01 } };
    expect(solvePlans(short, [farther]).options).toEqual([]);
    expect(solvePlans(short, [venue]).options.length).toBeGreaterThan(0);
    expect(solvePlans(snapshot, [farther]).options.length).toBeGreaterThan(0);
  });
  it("uses the member's rough origin when supplied", () => {
    const far = { lat: 50, lng: -73 };
    const members = snapshot.members.map((member, index) =>
      index === 0 ? { ...member, origin: far } : member,
    );
    expect(solvePlans({ ...snapshot, members }, [venue]).options).toEqual([]);
  });
  it("returns no options without overlapping availability or participant details", () => {
    const odd = {
      ...snapshot.members[0],
      id: "33333333-3333-4333-8333-333333333333",
      budget: 1,
      maxTravelMin: 30,
      freeFrom: "09:00",
      freeTo: "10:00",
      origin: null,
    };
    const result = solvePlans({ ...snapshot, members: [...snapshot.members, odd] }, [venue]);
    expect(result).toEqual({ options: [] });
    const plan = solvePlans(snapshot, [venue]).options[0];
    expect(plan && Object.keys(plan)).not.toContain("members");
  });
  it("keeps midnight availability on the following Montreal day", () => {
    const result = solvePlans(
      {
        ...snapshot,
        members: snapshot.members.map((m) => ({ ...m, freeFrom: "21:00", freeTo: "01:00" })),
      },
      [venue],
    );
    expect(result.options).toHaveLength(6);
    expect(result.options[0]?.startAt).toBe("2026-11-23T02:00:00.000Z");
    expect(result.options.at(-1)?.endAt).toBe("2026-11-23T06:00:00.000Z");
  });
  it("handles previous-day opening hours closing at 02:00", () => {
    const open = { ...venue, hours: { "0": [{ open: "21:00", close: "02:00" }] } };
    expect(
      openForSlot(open, wallTime("2026-11-23", "00:00"), wallTime("2026-11-23", "01:30")),
    ).toBe(true);
    expect(
      openForSlot(open, wallTime("2026-11-23", "01:00"), wallTime("2026-11-23", "02:30")),
    ).toBe(false);
  });
  it("requires continuous verified opening coverage", () => {
    const closed = {
      ...venue,
      hours: {
        "0": [
          { open: "18:00", close: "19:00" },
          { open: "19:30", close: "22:00" },
        ],
      },
    };
    expect(
      openForSlot(
        closed,
        wallTime(snapshot.config.date, "18:30"),
        wallTime(snapshot.config.date, "20:00"),
      ),
    ).toBe(false);
    expect(solvePlans(snapshot, [venue]).options[0]?.hoursUnknown).toBe(false);
    expect(solvePlans(snapshot, [{ ...venue, hours: null }]).options).toEqual([]);
    expect(solvePlans(snapshot, [{ ...venue, hours: {} }]).options).toEqual([]);
  });
  it("drops winter venues in July and summer venues in November", () => {
    expect(
      solvePlans({ ...snapshot, config: { ...snapshot.config, date: "2026-07-22" } }, [
        { ...venue, season: "winter" },
      ]).options,
    ).toEqual([]);
    expect(solvePlans(snapshot, [{ ...venue, season: "summer" }]).options).toEqual([]);
  });
  it("penalizes rain later in a slot, keeping indoor venues ahead", () => {
    const forecast = [{ at: "2026-11-23T00:00:00Z", temperature: 10, precipitation: 80, code: 61 }];
    const singleSlot = {
      ...snapshot,
      members: snapshot.members.map((m) => ({ ...m, freeTo: "19:30" })),
    };
    const options = solvePlans(
      singleSlot,
      [{ ...venue, placeId: "outdoor", outdoor: true }, venue],
      forecast,
    ).options;
    expect(options[0]?.venue.placeId).toBe("free");
    expect(options[1]?.score).toBe(0.5);
  });
  it("uses extreme-temperature penalty and neutral unavailable forecast", () => {
    const start = wallTime(snapshot.config.date, "18:00");
    expect(
      weatherForSlot({ ...venue, outdoor: true }, start, start + 90 * 60000, [
        { at: new Date(start).toISOString(), temperature: -11, precipitation: 0, code: 0 },
      ]).penalty,
    ).toBe(0.4);
    expect(weatherForSlot({ ...venue, outdoor: true }, start, start + 90 * 60000, []).penalty).toBe(
      0,
    );
  });
  it("breaks equal weather scores by earliest start, rating and place ID", () => {
    const venues = [
      { ...venue, placeId: "b" },
      { ...venue, placeId: "a" },
      { ...venue, placeId: "rated", rating: 5 },
    ];
    const tied = solvePlans(snapshot, venues).options;
    expect(tied.slice(0, 3).map((p) => p.venue.placeId)).toEqual(["rated", "a", "b"]);
    expect(tied[2]?.startAt).toBe(tied[0]?.startAt);
    expect(tied[3]?.startAt).not.toBe(tied[0]?.startAt);
    expect(solvePlans(snapshot, [...venues].reverse()).options).toEqual(tied);
  });
  it("caps stored ranking at 20 privacy-safe options", () => {
    expect(
      solvePlans(
        snapshot,
        Array.from({ length: 30 }, (_, i) => ({ ...venue, placeId: String(i) })),
      ).options,
    ).toHaveLength(20);
  });
  it("uses Montreal daylight saving and rejects ambiguous or missing civil times", () => {
    expect(wallTime("2026-07-22", "18:00")).toBe(Date.parse("2026-07-22T22:00:00Z"));
    expect(localDay(wallTime("2026-11-22", "18:00")).weekday).toBe(0);
    expect(() => wallTime("2026-03-08", "02:30")).toThrow();
    expect(() => wallTime("2026-11-01", "01:30")).toThrow();
    const DST = {
      config: { ...snapshot.config, date: "2026-11-01" },
      members: snapshot.members.map((member) => ({
        ...member,
        freeFrom: "01:30",
        freeTo: "05:00",
      })),
    };
    expect(solvePlans(DST, [venue]).options).toEqual([]);
  });
});
