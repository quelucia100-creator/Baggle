import { describe, expect, it, vi } from "vitest";
import { solveV3 } from "@/lib/planning-v3/solver";
import { travelForSlot } from "@/lib/planning-v3/travel";
import type { RouteProvider, RouteQuery } from "@/lib/planning-v3/travel";
import { normalizePreferences } from "@/lib/planning-v3/schema";
import {
  clock,
  day,
  destination,
  hostConfig,
  iso,
  now,
  point,
  prefs,
  snapshot,
  venue,
} from "./planning-v3-fixtures";
import type { VenueCandidateV3 } from "@/lib/planning-v3/venue";

const min = 60_000;
const mockRoute = (minutes = 10): RouteProvider => ({
  route: async ({ at, timing }) =>
    timing === "arrive"
      ? { start: at - minutes * min, end: at }
      : { start: at, end: at + minutes * min },
});
const matching = (v: VenueCandidateV3, input = snapshot(), routes = mockRoute()) =>
  solveV3(input, [v], routes, new Map(), now);

describe("V3 match engine", () => {
  it("allows cheaper options, enforces the hard cap and separates unknown from explicit free", async () => {
    const v = venue();
    expect(await matching(v)).toHaveLength(1);
    const budget = { ...prefs().budget, preferredMinCad: 0, preferredMaxCad: 0, hardMaxCad: 0 };
    const p = { ...prefs(), budget };
    expect(await matching(v, snapshot([p, prefs()]))).toEqual([]);
    expect(await matching({ ...v, cost: null })).toEqual([]);
    const unrestricted = {
      ...p,
      budget: { ...budget, hardMaxCad: null, explicitlyUnlimited: true },
    };
    expect(
      (await matching({ ...v, cost: null }, snapshot([unrestricted, unrestricted])))[0],
    ).toMatchObject({ warnings: expect.arrayContaining(["cost_unknown"]) });
    const host = hostConfig();
    host.rules.freeOnly = true;
    expect(
      await matching({ ...v, cost: null }, snapshot([unrestricted, unrestricted], host)),
    ).toEqual([]);
    const free = { ...v.cost!, minCad: 0, maxCad: 0, free: true };
    expect(await matching({ ...v, cost: free }, snapshot([p, prefs()], host))).toHaveLength(1);
  });

  it("treats age restrictions, alcohol, exclusions and verified needs separately", async () => {
    const v = venue();
    const config = hostConfig();
    config.rules.under18Friendly = true;
    config.rules.alcoholPolicy = "no_age_restricted";
    expect(await matching(v, snapshot(undefined, config))).toHaveLength(1);
    expect(await matching({ ...v, under18Allowed: null }, snapshot(undefined, config))).toEqual([]);
    config.rules.alcoholPolicy = "alcohol_free_only";
    expect(await matching(v, snapshot(undefined, config))).toEqual([]);
    const accessible = { ...v, alcoholFree: true, accessibility: ["step_free"] };
    expect(await matching(accessible, snapshot(undefined, config))).toHaveLength(1);
    const p = {
      ...prefs(),
      accessibilityHardRequirements: ["step_free"],
      dietaryHardRequirements: ["peanut_free"],
      optionalNote: "Require a pool",
    };
    expect(await matching(accessible, snapshot([p, prefs()], config))).toEqual([]);
    const suitable = { ...accessible, dietary: ["peanut_free"] };
    expect(
      await matching({ ...suitable, accessibility: [] }, snapshot([p, prefs()], config)),
    ).toEqual([]);
    expect(await matching(suitable, snapshot([p, prefs()], config))).toHaveLength(1);
    expect(
      await matching(
        { ...suitable, activities: ["arts_culture", "nightlife"] },
        snapshot([{ ...p, excludedActivities: ["nightlife"] }, prefs()], config),
      ),
    ).toEqual([]);
  });

  it("uses max-min preference before mean, stable ties, and no private ranking fields", async () => {
    const v = venue();
    const p = {
      ...prefs(),
      vibes: ["creative", "social_lively"] as const,
      likedActivities: ["entertainment"] as const,
    };
    const members = [
      prefs(),
      { ...p, vibes: [...p.vibes], likedActivities: [...p.likedActivities] },
    ];
    const unbalanced = { ...v, placeId: "a", rating: 5 };
    const balanced: VenueCandidateV3 = {
      ...v,
      placeId: "z",
      vibes: ["chill_cozy", "creative"],
      activities: ["outdoors"],
    };
    const result = await solveV3(
      snapshot(members),
      [unbalanced, balanced],
      mockRoute(),
      new Map(),
      now,
    );
    expect(result[0]?.venue.placeId).toBe("z");
    expect(
      await solveV3(snapshot(members), [balanced, unbalanced], mockRoute(), new Map(), now),
    ).toEqual(result);
    expect(result[0]).toMatchObject({
      compromise: "Review this option",
      hoursUnknown: false,
      durationMinutes: 60,
      routeVerifiability: "provider_verified",
      venue: { address: v.address, attribution: v.attribution, priceTier: null },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /45\.51[,}]|score|outlier|accessibilityHardRequirements/,
    );
  });

  it("searches multiple dates, lengths and disjoint windows, including an overnight finish", async () => {
    const config = hostConfig();
    const second = "2026-11-24";
    config.dateSelection = {
      ...config.dateSelection,
      selectionStyle: "multiple",
      candidateDates: [day, second],
    };
    config.duration = { mode: "flexible", minMinutes: 30, maxMinutes: 90 };
    const p = prefs();
    p.availability.days = [
      {
        date: day,
        confirmed: true,
        busyIntervals: [{ startAt: iso(clock("00:00")), endAt: iso(clock("21:00")) }],
      },
      {
        date: second,
        confirmed: true,
        busyIntervals: [{ startAt: iso(clock("19:00", 1)), endAt: iso(clock("21:00", 1)) }],
      },
    ];
    const v = venue();
    v.opening = [
      ...v.opening,
      { start: clock("23:30"), end: clock("00:30", 1) },
      { start: clock("21:00", 1), end: clock("22:30", 1) },
    ];
    const options = await matching(v, snapshot([p, p], config));
    expect(
      options.some((option) => option.date === day && option.endAt === iso(clock("00:30", 1))),
    ).toBe(true);
    expect(options.some((option) => option.date === second && option.durationMinutes === 90)).toBe(
      false,
    );
    expect(options.some((option) => option.date === second && option.durationMinutes === 60)).toBe(
      true,
    );
    expect(options.some((option) => option.durationMinutes === 30)).toBe(true);
  });

  it("reports the actual Montreal date for a start in the selected day's overnight spillover", async () => {
    const v = {
      ...venue(),
      expiresAt: clock("03:00", 1),
      opening: [{ start: clock("01:00", 1), end: clock("02:00", 1) }],
    };
    expect(await matching(v)).toEqual([
      expect.objectContaining({ date: "2026-11-24", startAt: iso(clock("01:00", 1)) }),
    ]);
  });

  it("fails closed on holiday gaps, unsafe or missing weather and expired facts", async () => {
    const v = {
      ...venue(),
      outdoor: true,
      opening: [{ start: clock("19:30"), end: clock("20:30") }],
    };
    const forecast = (start: number, code: number, temperature = 10) => ({
      at: iso(start),
      temperature,
      precipitation: 0,
      code,
    });
    const safe = forecast(clock("19:00"), 0);
    const solve = (hours: ReturnType<typeof forecast>[], candidate = v) =>
      solveV3(snapshot(), [candidate], mockRoute(), new Map([[v.placeId, hours]]), now);
    expect(await solve([safe])).toEqual([]);
    for (const unsafe of [
      forecast(clock("20:00"), 61),
      forecast(clock("20:00"), 73),
      forecast(clock("20:00"), 0, -6),
      forecast(clock("20:00"), 0, 33),
    ])
      expect(await solve([safe, unsafe])).toEqual([]);
    const good = [safe, forecast(clock("20:00"), 0)];
    expect(await solve(good)).toHaveLength(1);
    expect(
      await solve(good, { ...v, opening: [{ start: clock("19:30"), end: clock("20:00") }] }),
    ).toEqual([]);
    expect(await solve(good, { ...v, expiresAt: now })).toEqual([]);
    expect(await solve(good, { ...v, season: "summer" })).toEqual([]);
  });

  it("applies the return journey to a tonight return cutoff after midnight", async () => {
    const localNow = clock("20:00");
    const config = hostConfig();
    config.dateSelection = {
      mode: "today_tonight",
      selectionStyle: null,
      candidateDates: [day],
      range: null,
    };
    const p = prefs();
    p.availability = {
      mode: "tonight",
      days: [],
      tonight: {
        earliestDepartureAt: null,
        anytimeFromNow: true,
        latestReturnAt: iso(clock("00:10", 1)),
        noReturnDeadline: false,
      },
    };
    const valid = normalizePreferences(p, config, localNow);
    const v = { ...venue(), opening: [{ start: clock("23:00"), end: clock("00:00", 1) }] };
    expect(
      await solveV3(snapshot([valid, valid], config), [v], mockRoute(11), new Map(), localNow),
    ).toEqual([]);
    expect(
      await solveV3(snapshot([valid, valid], config), [v], mockRoute(10), new Map(), localNow),
    ).toHaveLength(1);
  });
});

describe("V3 route feasibility", () => {
  it("requires route evidence even when a rounded origin equals the destination", async () => {
    expect(
      await matching({ ...venue(), location: point }, snapshot(), { route: async () => null }),
    ).toEqual([]);
  });

  it("rejects unreachable, thrown, late or over-cap routes independently in either direction", async () => {
    expect(await matching(venue(), snapshot(), { route: async () => null })).toEqual([]);
    expect(
      await matching(venue(), snapshot(), {
        route: async () => {
          throw new Error("private route trace");
        },
      }),
    ).toEqual([]);
    const route = mockRoute(10).route;
    expect(
      await matching(venue(), snapshot(), {
        route: async (q) =>
          q.timing === "depart" ? { start: q.at, end: q.at + 31 * min } : route(q),
      }),
    ).toEqual([]);
    expect(
      await matching(venue(), snapshot(), {
        route: async (q) => (q.timing === "arrive" ? { start: q.at, end: q.at + min } : route(q)),
      }),
    ).toEqual([]);
  });
  it("uses shared legs, transfer buffers, member return mode and member meeting confirmation", async () => {
    const config = hostConfig();
    const meeting = { lat: 45.515, lng: -73.575, label: "Meeting point" };
    config.travelArrangement = {
      mode: "together",
      sharedMeetingPoint: meeting,
      sharedMode: "drive",
    };
    const p = prefs();
    p.travel.returnMode = "bike";
    const slot = { start: clock("19:00"), end: clock("20:00") };
    const members = [{ preferences: p, windows: [{ start: clock("18:00"), end: clock("21:00") }] }];
    const route = vi.fn<(query: RouteQuery) => ReturnType<RouteProvider["route"]>>(
      mockRoute().route,
    );
    const provider = { route };
    expect(await travelForSlot(provider, config, members, destination, slot)).toEqual([25 / 30]);
    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({ from: point, to: meeting, mode: "walk", at: clock("18:45") }),
    );
    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({ from: meeting, to: point, mode: "bike", at: clock("20:15") }),
    );
    p.travel.maxOneWayMinutes = 24;
    expect(await travelForSlot(provider, config, members, destination, slot)).toBeNull();
    p.travel.alreadyAtSharedMeetingPoint = true;
    route.mockClear();
    expect(await travelForSlot(provider, config, members, destination, slot)).toEqual([10 / 24]);
    expect(route).toHaveBeenCalledTimes(2);
  });
});
