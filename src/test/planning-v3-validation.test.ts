import { describe, expect, it } from "vitest";
import { localDay, shiftDate, wallTime } from "@/lib/planning/tz";
import {
  availableWindows,
  normalizeConfig,
  normalizePreferences,
  unambiguous,
} from "@/lib/planning-v3/schema";
import { parsePlanningRequest } from "@/lib/planning-v3/request";
import { clock, day, hostConfig, iso, now, prefs } from "./planning-v3-fixtures";

describe("Planning V3 canonical requests", () => {
  it("uses the Montreal date, even when UTC is tomorrow", () => {
    expect(iso(now).slice(0, 10)).toBe(day);
    const input = hostConfig();
    input.dateSelection = {
      mode: "today_tonight",
      selectionStyle: null,
      candidateDates: [],
      range: null,
    };
    expect(normalizeConfig(input, now).dateSelection.candidateDates).toEqual([localDay(now).date]);
    input.dateSelection.candidateDates = [localDay(now).date, day];
    expect(() => normalizeConfig(input, now)).toThrow();
  });
  it("normalizes single, multiple, range and best-day selections and bounds the horizon", () => {
    expect(normalizeConfig(hostConfig(), now).dateSelection.candidateDates).toEqual([day]);
    const input = hostConfig();
    const last = shiftDate(day, 13);
    input.dateSelection = {
      mode: "future_dates",
      selectionStyle: "multiple",
      candidateDates: [last, day],
      range: null,
    };
    expect(normalizeConfig(input, now).dateSelection.candidateDates).toEqual([day, last]);
    input.dateSelection = {
      mode: "future_dates",
      selectionStyle: "range",
      candidateDates: [],
      range: { startDate: day, endDate: last },
    };
    expect(normalizeConfig(input, now).dateSelection.candidateDates).toHaveLength(14);
    input.dateSelection = { ...input.dateSelection, mode: "best_day", selectionStyle: null };
    expect(normalizeConfig(input, now).dateSelection.candidateDates.at(-1)).toBe(last);
    input.dateSelection.range = { startDate: shiftDate(day, -1), endDate: last };
    expect(() => normalizeConfig(input, now)).toThrow();
    input.dateSelection = {
      mode: "future_dates",
      selectionStyle: "single",
      candidateDates: [shiftDate(last, 1)],
      range: null,
    };
    expect(() => normalizeConfig(input, now)).toThrow();
  });
  it("rejects duplicate, invalid or inconsistent dates and unsupported fields and versions", () => {
    for (const dates of [[day, day], ["2026-11-31"], ["2026-11-20"]]) {
      const input = hostConfig();
      input.dateSelection = {
        mode: "future_dates",
        selectionStyle: "multiple",
        candidateDates: dates,
        range: null,
      };
      expect(() => normalizeConfig(input, now)).toThrow();
    }
    const base = { action: "save", code: "ABC123", token: "a".repeat(64) };
    for (const preferences of [
      { ...prefs(), version: 4 },
      { ...prefs(), injected: true },
      { budget: 2, freeFrom: "18:00", freeTo: "19:00", maxTravelMin: 30, version: 3 },
    ])
      expect(() => parsePlanningRequest({ ...base, preferences })).toThrow("Check the planning");
    expect(() =>
      parsePlanningRequest({
        action: "finalize",
        code: "ABC123",
        token: "a".repeat(64),
        schemaVersion: 3,
      }),
    ).toThrow();
  });
  it("enforces explicit budget, location, shared point, duration, distinct vibes and no-go choices", () => {
    const p = prefs();
    p.budget.hardMaxCad = null;
    expect(() => normalizePreferences(p, hostConfig(), now)).toThrow();
    p.budget.explicitlyUnlimited = true;
    expect(normalizePreferences(p, hostConfig(), now).budget.hardMaxCad).toBeNull();
    const invalid = [
      { ...p, vibes: ["chill_cozy", "chill_cozy"] },
      { ...p, budget: { ...p.budget, preferredMinCad: 12 } },
      { ...p, excludedActivities: ["arts_culture"] },
      { ...p, origin: { ...p.origin, lat: null } },
      { ...p, travel: { ...p.travel, alreadyAtSharedMeetingPoint: true } },
      {
        ...p,
        origin: {
          source: "group_area",
          lat: null,
          lng: null,
          label: null,
          accuracy: "approximate",
        },
      },
    ];
    for (const value of invalid)
      expect(() => normalizePreferences(value, hostConfig(), now)).toThrow();
    expect(() =>
      normalizeConfig(
        { ...hostConfig(), duration: { mode: "fixed", minMinutes: 30, maxMinutes: 60 } },
        now,
      ),
    ).toThrow();
    expect(() =>
      normalizeConfig(
        { ...hostConfig(), duration: { mode: "flexible", minMinutes: 50, maxMinutes: 60 } },
        now,
      ),
    ).toThrow();
  });
});

describe("Planning V3 private availability", () => {
  it("sorts and merges adjacent drag-grid blocks and computes several free windows", () => {
    const p = prefs();
    p.availability.days[0]!.busyIntervals = [
      { startAt: iso(clock("19:30")), endAt: iso(clock("20:30")) },
      { startAt: iso(clock("10:00")), endAt: iso(clock("10:30")) },
      { startAt: iso(clock("19:00")), endAt: iso(clock("19:30")) },
      { startAt: iso(clock("00:30", 1)), endAt: iso(clock("01:00", 1)) },
    ];
    const normalized = normalizePreferences(p, hostConfig(), now);
    expect(normalized.availability.days[0]!.busyIntervals).toHaveLength(3);
    expect(availableWindows(normalized, day, now)).toEqual([
      { start: clock("00:00"), end: clock("10:00") },
      { start: clock("10:30"), end: clock("19:00") },
      { start: clock("20:30"), end: clock("00:30", 1) },
      { start: clock("01:00", 1), end: clock("06:00", 1) },
    ]);
  });
  it("rejects unconfirmed days, malformed, off-grid, reversed, overlapping and full-day blocks", () => {
    const p = prefs();
    p.availability.days[0]!.confirmed = false;
    expect(availableWindows(p, day, now)).toEqual([]);
    expect(() => normalizePreferences(p, hostConfig(), now)).toThrow();
    p.availability.days[0]!.confirmed = true;
    expect(() => normalizePreferences(p, hostConfig(), now)).not.toThrow();
    for (const [from, to] of [
      ["19:00", "19:00"],
      ["20:00", "18:00"],
      ["19:05", "20:00"],
    ] as const) {
      p.availability.days[0]!.busyIntervals = [
        { startAt: iso(clock(from)), endAt: iso(clock(to)) },
      ];
      expect(() => normalizePreferences(p, hostConfig(), now)).toThrow();
    }
    p.availability.days[0]!.busyIntervals = [
      { startAt: iso(clock("19:00")), endAt: iso(clock("20:00")) },
      { startAt: iso(clock("19:30")), endAt: iso(clock("21:00")) },
    ];
    expect(() => normalizePreferences(p, hostConfig(), now)).toThrow();
    p.availability.days[0]!.busyIntervals = [
      { startAt: iso(clock("00:00")), endAt: iso(clock("06:00", 1)) },
    ];
    expect(() => normalizePreferences(p, hostConfig(), now)).toThrow();
  });
  it("treats anytime and no deadline independently and accepts a next-day return cutoff", () => {
    const schedule = hostConfig();
    schedule.dateSelection = {
      mode: "today_tonight",
      selectionStyle: null,
      range: null,
      candidateDates: [day],
    };
    const p = prefs();
    const tonight = {
      earliestDepartureAt: null,
      latestReturnAt: iso(clock("01:00", 1)),
      anytimeFromNow: true,
      noReturnDeadline: false,
    } as const;
    p.availability = { mode: "tonight", days: [], tonight };
    expect(
      availableWindows(normalizePreferences(p, schedule, clock("20:17")), day, clock("20:17")),
    ).toEqual([{ start: clock("20:17"), end: clock("01:00", 1) }]);
    p.availability.tonight = {
      ...tonight,
      earliestDepartureAt: iso(clock("21:05")),
      anytimeFromNow: false,
      latestReturnAt: null,
      noReturnDeadline: true,
    };
    expect(
      availableWindows(normalizePreferences(p, schedule, clock("20:17")), day, clock("20:17")),
    ).toEqual([{ start: clock("21:05"), end: clock("06:00", 1) }]);
    p.availability.tonight.latestReturnAt = iso(clock("01:00"));
    expect(() => normalizePreferences(p, schedule, clock("20:17"))).toThrow();
  });
  it("rejects nonexistent spring civil time and both repeated fall slot endpoints", () => {
    expect(() => wallTime("2026-03-08", "02:30")).toThrow(RangeError);
    expect(() => wallTime("2026-11-01", "01:30")).toThrow(RangeError);
    for (const instant of ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"])
      expect(unambiguous(Date.parse(instant), true)).toBe(false);
    expect(wallTime("2026-03-08", "03:30") - wallTime("2026-03-08", "01:30")).toBe(60 * 60_000);
    expect(wallTime("2026-11-01", "02:30") - wallTime("2026-11-01", "00:30")).toBe(180 * 60_000);
  });
});
