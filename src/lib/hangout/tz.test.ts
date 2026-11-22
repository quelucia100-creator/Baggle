import { describe, expect, it } from "vitest";
import {
  addDays,
  APP_TIME_ZONE,
  ceilToHalfHour,
  isCrossingMidnight,
  monthOf,
  parseWallTime,
  windowToInterval,
  zonedParts,
  zonedToInstant,
} from "./tz";

const hourMs = 3_600_000;

describe("Montreal calendar time", () => {
  it("accepts form and Postgres times and rejects malformed times", () => {
    const nine = { hour: 21, minute: 0 };
    expect(parseWallTime("21:00")).toEqual(nine);
    expect(parseWallTime("21:00:00")).toEqual(nine);
    for (const invalid of ["24:00", "9:5", "", "12:60", "21:00:60"]) {
      expect(() => parseWallTime(invalid)).toThrow(RangeError);
    }
  });

  it.each([
    ["2026-07-15", "2026-07-16T01:00:00.000Z"],
    ["2026-01-15", "2026-01-16T02:00:00.000Z"],
  ])("converts 21:00 on %s using the local offset", (date, expected) => {
    expect(zonedToInstant(date, { hour: 21, minute: 0 }).toISOString()).toBe(expected);
  });

  it.each([
    ["21:00", "01:00", 4, "2026-07-16T05:00:00Z"],
    ["18:00", "23:00", 5, "2026-07-16T03:00:00Z"],
    ["20:00", "00:00", 4, "2026-07-16T04:00:00Z"],
    ["21:00", "21:00", 24, "2026-07-17T01:00:00Z"],
  ])("interprets the %s–%s window", (from, to, hours, end) => {
    const interval = windowToInterval("2026-07-15", from, to);
    expect(interval.endMs - interval.startMs).toBe(hours * hourMs);
    expect(interval.endMs).toBe(Date.parse(end));
    expect(isCrossingMidnight(parseWallTime(from), parseWallTime(to))).toBe(to <= from);
  });

  it("counts the repeated hour and picks the earlier ambiguous instant", () => {
    const interval = windowToInterval("2026-10-31", "23:00", "03:00");
    expect(interval.endMs - interval.startMs).toBe(5 * hourMs);
    expect(zonedToInstant("2026-11-01", { hour: 1, minute: 30 }).toISOString()).toBe(
      "2026-11-01T05:30:00.000Z",
    );
  });

  it("moves nonexistent times forward by the gap", () => {
    const interval = windowToInterval("2026-03-08", "01:00", "04:00");
    expect(interval.endMs - interval.startMs).toBe(2 * hourMs);
    expect(zonedToInstant("2026-03-08", { hour: 2, minute: 30 }).toISOString()).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });

  it("reports local calendar parts and checks dates strictly", () => {
    expect(() => new Intl.DateTimeFormat("en", { timeZone: APP_TIME_ZONE })).not.toThrow();
    expect(zonedParts(new Date("2026-07-18T02:00:00Z"))).toEqual({
      date: "2026-07-17",
      weekday: 5,
      hour: 22,
      minute: 0,
      month: 7,
    });
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(monthOf("2026-07-17")).toBe(7);
    expect(() => monthOf("2026-02-29")).toThrow(RangeError);
  });

  it.each([
    ["2026-07-17T22:10:00Z", "2026-07-17T22:30:00Z"],
    ["2026-07-17T22:30:00Z", "2026-07-17T22:30:00Z"],
    ["2026-07-18T03:50:00Z", "2026-07-18T04:00:00Z"],
    ["2026-11-01T05:50:00Z", "2026-11-01T06:00:00Z"],
    ["2026-11-01T06:30:00.001Z", "2026-11-01T07:00:00Z"],
    ["2026-03-08T06:55:00Z", "2026-03-08T07:00:00Z"],
  ])("rounds %s up to the next real local half-hour", (input, expected) => {
    expect(ceilToHalfHour(Date.parse(input))).toBe(Date.parse(expected));
  });
});
