import { describe, expect, it } from "vitest";
import { planningWarningsV3 } from "@/lib/planning-v3/contract";
import { projectState } from "@/lib/planning-v3/state";
import { clock, destination, hostConfig, iso, now, venue } from "./planning-v3-fixtures";

function databaseOption() {
  const v = venue();
  const sqlIso = (at: number) => iso(at).replace(".000Z", "Z");
  return {
    version: 3,
    date: "2026-11-24",
    startAt: sqlIso(clock("01:00", 1)),
    endAt: sqlIso(clock("02:00", 1)),
    durationMinutes: 60,
    timeZone: "America/Montreal",
    routeVerifiability: "provider_verified",
    compromise: "Review this option",
    hoursUnknown: false,
    weather: { temperature: 8, precipitation: 0, code: 0, unsafeDesc: "private" },
    warnings: ["route_estimates", "paths_may_be_incomplete", "availability_not_reserved"],
    venue: {
      placeId: v.placeId,
      name: v.name,
      category: "arts_culture",
      priceTier: null,
      location: { ...destination, debug: "private" },
      mapsUrl: v.mapsUrl,
      outdoor: false,
      address: v.address,
      source: "curated",
      sourceTimestamp: sqlIso(now),
      attribution: [{ name: "Venue evidence", url: "https://example.org", private: "private" }],
      cost: { ...v.cost!, checkedAt: sqlIso(now), private: "private" },
      bookingRequired: "yes",
      bookingUrl: "https://example.org/book",
      accessibilityVerified: false,
      private: "private",
    },
  };
}
function databaseState(plan: unknown) {
  return {
    schemaVersion: 3,
    config: hostConfig(),
    status: "locked",
    revision: 3,
    selfPreferences: null,
    members: [],
    plan,
    planIndex: 0,
    optionCount: 1,
    groupRerollsUsed: 0,
    votes: 0,
    voteThreshold: 1,
    selfVoted: false,
    noPlanReason: null,
    venueSource: "curated",
  };
}

describe("Planning V3 SQL public projection contract", () => {
  it("decodes actual next-day start, SQL UTC timestamps and nested venue metadata", () => {
    const option = databaseOption();
    const state = projectState(databaseState(option), now);
    expect(state).toMatchObject({
      schemaVersion: 3,
      plan: {
        date: "2026-11-24",
        startAt: iso(clock("01:00", 1)),
        endAt: iso(clock("02:00", 1)),
        hoursUnknown: false,
        routeVerifiability: "provider_verified",
        weather: { temperature: 8, precipitation: 0, code: 0 },
        warnings: [...option.warnings].sort(),
        venue: {
          cost: { currency: "CAD", minCad: 5, maxCad: 5, checkedAt: iso(now) },
          bookingRequired: "yes",
          bookingUrl: option.venue.bookingUrl,
          attribution: [{ name: "Venue evidence", url: "https://example.org" }],
        },
      },
    });
    expect(JSON.stringify(state)).not.toContain('"private"');
    expect(
      option.warnings.every((warn) => planningWarningsV3.some((allowed) => allowed === warn)),
    ).toBe(true);
  });
  it("rejects a false anchor date, an out-of-window finish and unallowlisted warnings", () => {
    const o = databaseOption();
    for (const invalid of [
      { ...o, date: "2026-11-23" },
      { ...o, startAt: iso(clock("05:30", 1)), endAt: iso(clock("06:30", 1)) },
      { ...o, startAt: iso(clock("01:05", 1)), endAt: iso(clock("02:05", 1)) },
      { ...o, warnings: ["private group constraint"] },
      { ...o, warnings: ["route_estimates", "route_estimates"] },
      { ...o, venue: { ...o.venue, bookingRequired: "unknown" } },
    ])
      expect(() => projectState(databaseState(invalid), now)).toThrow(
        "Planning is temporarily unavailable",
      );
  });
  it("accepts explicitly unknown cost, booking and forecast with public warning codes", () => {
    const o = databaseOption();
    const plan = {
      ...o,
      weather: null,
      warnings: ["booking_unknown", "cost_unknown", "forecast_unknown"],
      venue: { ...o.venue, cost: null, bookingRequired: "unknown", bookingUrl: null },
    };
    expect(projectState(databaseState(plan), now)).toMatchObject({
      plan: {
        weather: null,
        warnings: plan.warnings,
        venue: { cost: null, bookingRequired: "unknown", bookingUrl: null },
      },
    });
  });
});
