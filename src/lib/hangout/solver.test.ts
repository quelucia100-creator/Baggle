import { describe, expect, it } from "vitest";
import { solvePlans } from "../planning/solver";
import type { Snapshot, Venue as PlanningVenue } from "../planning/types";
import { member, solverInput, testArea, venue } from "./fixtures";
import {
  budgetCost,
  candidateStarts,
  compareCandidates,
  compromiseText,
  computeOverlap,
  haversineKm,
  hoursStatus,
  isInSeason,
  memberCost,
  solve,
  travelCost,
  travelMinutes,
  validateSolverInput,
  weatherPenalty,
  type RankedCandidate,
} from "./solver";
import type { OpeningHours, PriceTier, SolverInput, WeatherHour } from "./types";
import { windowToInterval, zonedParts } from "./tz";

const friday = "2026-07-17";
const winterExemption = { winterVenueWeatherExemption: true };
const defaultWeather = { winterVenueWeatherExemption: false };

it("keeps the planning category and hangout season across midnight and allows time-slot rerolls", () => {
  const snapshot: Snapshot = {
    config: {
      date: "2026-10-31",
      durationMin: 90,
      area: testArea,
      areaLabel: "Montreal",
      category: "park",
    },
    members: ["a", "b"].map((id) => ({
      id,
      budget: 0,
      freeFrom: "23:30",
      freeTo: "02:00",
      maxTravelMin: 30,
      origin: null,
    })),
  };
  const summer: PlanningVenue = {
    placeId: "summer",
    name: "Park",
    category: "park",
    priceTier: 0,
    location: testArea,
    hours: null,
    outdoor: true,
    season: "summer",
    rating: null,
    mapsUrl: "https://maps.example/park",
  };
  const result = solvePlans(snapshot, [
    summer,
    { ...summer, placeId: "winter", season: "winter" },
    { ...summer, placeId: "museum", category: "museum" },
  ]);
  expect(result.options.length).toBeGreaterThan(1);
  expect(new Set(result.options.map((option) => option.venue.placeId))).toEqual(
    new Set(["summer"]),
  );
});

function options(input: SolverInput) {
  const result = solve(input);
  if (result.kind !== "plan") throw new Error(`Expected a plan, got ${result.reason}`);
  return result.options;
}

function availability(id: string, freeFrom: string, freeTo: string) {
  return member(id, { freeFrom, freeTo });
}

function forecast(overrides: Partial<WeatherHour> = {}): WeatherHour {
  return {
    startsAt: "2026-07-17T22:00:00Z",
    temperatureC: 20,
    precipProbability: 0,
    weatherCode: 0,
    ...overrides,
  };
}

describe("fairness costs", () => {
  it.each<[PriceTier | null, PriceTier | null, number]>([
    [2, 2, 0],
    [3, 2, 0.25],
    [3, 1, 0.5],
    [4, 0, 1],
    [1, 3, 0],
    [0, 0, 0],
    [null, 2, 0],
    [2, null, 0],
  ])("scores price %s vs budget %s as %s", (price, budget, cost) => {
    expect(budgetCost(price, budget)).toBe(cost);
  });

  it("normalizes distance and uses the shared origin when present", () => {
    const point = { lat: 0, lng: 1 };
    expect(haversineKm(testArea, point)).toBeCloseTo(111.19, 2);
    expect(travelMinutes(testArea, { lat: 0, lng: 2 / haversineKm(testArea, point) })).toBeCloseTo(
      13,
    );
    expect(travelCost(30, 20)).toBe(0.5);
    expect(travelCost(50, 20)).toBe(1);
    expect(travelCost(10, 20)).toBe(0);
    expect(travelCost(100, null)).toBe(0);
    const destination = venue("far", { location: point });
    expect(memberCost(member("a", { maxTravelMin: 20 }), destination, testArea)).toBe(1);
    expect(
      memberCost(member("a", { maxTravelMin: 20, origin: point }), destination, testArea),
    ).toBe(0);
  });

  it("rejects bad tiers, durations, travel limits, and empty groups", () => {
    const invalidInputs: Partial<SolverInput>[] = [
      ...[5, -1, 1.5].map((price) => ({
        venues: [venue("invalid", { priceTier: price as PriceTier })],
      })),
      { members: [member("a", { budget: 5 as PriceTier })] },
      { members: [member("a", { maxTravelMin: 4 })] },
      { members: [member("a", { maxTravelMin: 91 })] },
      { durationMin: 29 },
      { durationMin: 241 },
      { durationMin: 90.5 },
      { members: [] },
    ];
    for (const input of invalidInputs) {
      expect(() => validateSolverInput(solverInput(input))).toThrow(RangeError);
    }
  });

  it("ranks by the worst-off member before the mean", () => {
    const longitudePerKm = 1 / haversineKm(testArea, { lat: 0, lng: 1 });
    const members = [
      member("a", { budget: 1, maxTravelMin: 20, origin: testArea }),
      member("b", { budget: 1 }),
      member("c", { budget: 1 }),
    ];
    const venues = [
      venue("x", { priceTier: 1, location: { lat: 0, lng: 6.25 * longitudePerKm } }),
      venue("y", { priceTier: 2 }),
    ];
    const ranked = options(solverInput({ members, venues }));
    expect(ranked.map(({ venueId, score }) => [venueId, score])).toEqual([
      ["y", 0.75],
      ["x", 0.5],
    ]);
  });

  it("gives a free venue full credit for a budget-zero member", () => {
    const ranked = options(
      solverInput({
        members: [member("a", { budget: 0 })],
        venues: [venue("free", { priceTier: 0 })],
      }),
    );
    expect(ranked[0]).toMatchObject({ score: 1, compromise: "Works for everyone" });
  });
});

describe("availability and opening hours", () => {
  it("ranks half-hour starts across midnight", () => {
    const members = [availability("a", "21:00", "01:00"), availability("b", "22:00", "02:00")];
    const base = solverInput({ members });
    const ranked = options({ ...base, options: { ...base.options, distinctVenues: false } });
    expect(computeOverlap(friday, members)).toEqual(windowToInterval(friday, "22:00", "01:00"));
    expect(ranked.map(({ startAt }) => startAt)).toEqual([
      "2026-07-18T02:00:00.000Z",
      "2026-07-18T02:30:00.000Z",
      "2026-07-18T03:00:00.000Z",
      "2026-07-18T03:30:00.000Z",
    ]);
    expect(ranked.at(-1)?.endAt).toBe("2026-07-18T05:00:00.000Z");
  });

  it("treats each member's start as being on the hangout date", () => {
    expect(
      computeOverlap(friday, [
        availability("a", "20:00", "00:00"),
        availability("b", "18:00", "23:00"),
      ]),
    ).toEqual(windowToInterval(friday, "20:00", "23:00"));
    expect(
      computeOverlap(friday, [
        availability("a", "00:30", "02:00"),
        availability("b", "21:00", "01:00"),
      ]),
    ).toBeNull();
  });

  it("keeps both repeated half-hours and drops elapsed starts", () => {
    const fallBack = windowToInterval("2026-10-31", "23:00", "03:00");
    const ones = candidateStarts(fallBack, 90, null).filter((start) => {
      const local = zonedParts(start);
      return local.hour === 1 && local.minute === 0;
    });
    expect(ones).toEqual([Date.parse("2026-11-01T05:00:00Z"), Date.parse("2026-11-01T06:00:00Z")]);
    expect(
      candidateStarts(
        windowToInterval(friday, "18:00", "23:00"),
        90,
        new Date("2026-07-18T00:10:00Z"),
      )[0],
    ).toBe(Date.parse("2026-07-18T00:30:00Z"));
  });

  it("requires the whole slot on the local weekday and handles closing after midnight", () => {
    const monday = "2026-07-20";
    const weekday: OpeningHours = {
      periods: [
        {
          open: { day: 1, hour: 11, minute: 0 },
          close: { day: 1, hour: 23, minute: 0 },
        },
      ],
    };
    const overnight: OpeningHours = {
      periods: [
        {
          open: { day: 5, hour: 18, minute: 0 },
          close: { day: 6, hour: 2, minute: 0 },
        },
      ],
    };
    expect(hoursStatus(weekday, windowToInterval(monday, "21:00", "22:30"))).toBe("open");
    expect(hoursStatus(weekday, windowToInterval(monday, "22:00", "23:30"))).toBe("closed");
    expect(hoursStatus(weekday, windowToInterval(friday, "22:00", "23:30"))).toBe("closed");
    expect(hoursStatus(overnight, windowToInterval(friday, "22:00", "23:30"))).toBe("open");
    expect(hoursStatus(overnight, windowToInterval(friday, "23:30", "01:00"))).toBe("open");
    expect(hoursStatus(overnight, windowToInterval("2026-07-18", "01:00", "02:30"))).toBe("closed");
  });

  it("unions adjacent periods, distinguishes unknown hours, and keeps 23:59 literal", () => {
    const open = { day: 5, hour: 18, minute: 0 } as const;
    const midnight = { day: 6, hour: 0, minute: 0 } as const;
    const slot = windowToInterval(friday, "23:30", "01:00");
    expect(
      hoursStatus(
        {
          periods: [
            { open, close: midnight },
            { open: midnight, close: { day: 6, hour: 2, minute: 0 } },
          ],
        },
        slot,
      ),
    ).toBe("open");
    expect(hoursStatus({ periods: [{ open, close: null }] }, slot)).toBe("open");
    expect(
      hoursStatus(
        { periods: [{ open, close: { day: 5, hour: 23, minute: 59 } }] },
        windowToInterval(friday, "22:30", "00:00"),
      ),
    ).toBe("closed");
    for (const hours of [null, { periods: [] }]) {
      expect(hoursStatus(hours, slot)).toBe("unknown");
      expect(options(solverInput({ venues: [venue("unknown", { hours })] }))[0]?.hoursUnknown).toBe(
        true,
      );
    }
  });

  it("evaluates season using the hangout month and excludes closed venues", () => {
    const winter = venue("winter", { season: "winter" });
    const summer = venue("summer", { season: "summer" });
    expect(options(solverInput({ venues: [winter, summer] }))[0]?.venueId).toBe("summer");
    expect(options(solverInput({ date: "2026-01-15", venues: [winter, summer] }))[0]?.venueId).toBe(
      "winter",
    );
    expect(options(solverInput({ date: "2026-11-15", venues: [winter, summer] }))[0]?.venueId).toBe(
      "winter",
    );
    expect(options(solverInput({ date: "2026-05-01", venues: [winter, summer] }))[0]?.venueId).toBe(
      "summer",
    );
    for (const month of [4, 5, 10, 11]) {
      const warm = month >= 5 && month <= 10;
      expect(isInSeason("summer", month)).toBe(warm);
      expect(isInSeason("winter", month)).toBe(!warm);
      expect(isInSeason(null, month)).toBe(true);
    }
    expect(
      solve(
        solverInput({
          venues: [
            winter,
            venue("closed", {
              hours: {
                periods: [
                  {
                    open: { day: 5, hour: 11, minute: 0 },
                    close: { day: 5, hour: 12, minute: 0 },
                  },
                ],
              },
            }),
          ],
        }),
      ),
    ).toEqual({ kind: "no_plan", reason: "no_venue" });
  });
});

describe("slot weather", () => {
  const slot = windowToInterval(friday, "18:00", "20:00");
  const park = venue("park", { isOutdoor: true, priceTier: 0 });
  const rink = venue("rink", { isOutdoor: true, season: "winter" });
  const cafe = venue("cafe", { priceTier: 3 });
  const snow = forecast({ weatherCode: 73, temperatureC: -12, precipProbability: 80 });

  it("penalizes an outdoor park enough for an indoor cafe to win", () => {
    expect(
      options(
        solverInput({
          members: [availability("a", "18:00", "19:30"), availability("b", "18:00", "19:30")],
          venues: [park, cafe],
          weather: [forecast({ precipProbability: 60 })],
        }),
      ).map(({ venueId, score }) => [venueId, score]),
    ).toEqual([
      ["cafe", 0.75],
      ["park", 0.5],
    ]);
  });

  it.each<[Partial<WeatherHour>, number]>([
    [{ precipProbability: 40 }, 0],
    [{ weatherCode: 61, precipProbability: 10 }, 0.5],
    [{ temperatureC: -15 }, 0.4],
    [{ temperatureC: 33 }, 0.4],
    [{ temperatureC: -15, weatherCode: 61 }, 0.5],
  ])("uses the highest applicable outdoor penalty for %j", (input, penalty) => {
    expect(weatherPenalty(park, [forecast(input)], slot, defaultWeather).penalty).toBe(penalty);
  });

  it("checks every touched hour and excludes an hour starting at the end", () => {
    expect(
      weatherPenalty(
        park,
        [
          forecast(),
          forecast({
            startsAt: "2026-07-17T23:00:00Z",
            weatherCode: 63,
          }),
        ],
        slot,
        defaultWeather,
      ).penalty,
    ).toBe(0.5);
    expect(
      weatherPenalty(
        park,
        [
          forecast({
            startsAt: "2026-07-18T00:00:00Z",
            weatherCode: 63,
          }),
        ],
        slot,
        defaultWeather,
      ),
    ).toEqual({ penalty: 0, slot: null });
    expect(weatherPenalty(park, null, slot, defaultWeather)).toEqual({ penalty: 0, slot: null });
  });

  it("keeps indoor venues unpenalized and explains an indoor pick in snow", () => {
    const weather = weatherPenalty(cafe, [snow], slot, defaultWeather);
    expect(weather.penalty).toBe(0);
    expect(
      compromiseText({ budgetStretched: 0, travelStretched: 0, venue: cafe, slot: weather.slot }),
    ).toBe("Indoor pick: snow expected");
  });

  it("applies the winter exception only to snow and cold at winter venues", () => {
    expect(weatherPenalty(rink, [snow], slot, defaultWeather).penalty).toBe(0.5);
    expect(weatherPenalty(rink, [snow], slot, winterExemption).penalty).toBe(0);
    expect(
      weatherPenalty(
        rink,
        [forecast({ weatherCode: 63, temperatureC: -12 })],
        slot,
        winterExemption,
      ).penalty,
    ).toBe(0.5);
    expect(weatherPenalty(park, [snow], slot, winterExemption).penalty).toBe(0.5);
  });

  it("multiplies the weather penalty by the least-satisfied member's score", () => {
    const longitude = 4.75 / haversineKm(testArea, { lat: 0, lng: 1 });
    const ranked = options(
      solverInput({
        members: [member("a", { maxTravelMin: 20, freeTo: "19:30" })],
        venues: [venue("park", { isOutdoor: true, location: { lat: 0, lng: longitude } })],
        weather: [forecast({ precipProbability: 60 })],
      }),
    );
    expect(ranked[0]?.score).toBe(0.4);
  });

  it("lets an outdoor venue use a later slot when the rain ends", () => {
    const ranked = options(
      solverInput({
        venues: [park],
        weather: [
          forecast({ precipProbability: 60 }),
          forecast({ startsAt: "2026-07-17T23:00:00Z" }),
        ],
      }),
    );
    expect(ranked[0]).toMatchObject({ startAt: "2026-07-17T23:00:00.000Z", score: 1 });
  });
});

describe("deterministic ranking and privacy", () => {
  const candidate: RankedCandidate = {
    score: 0.8,
    meanSatisfaction: 0.9,
    startMs: 20,
    rating: 4.2,
    placeId: "b",
    venueId: "b",
  };

  it("breaks ties in the specified order", () => {
    for (const better of [
      { score: 0.9, meanSatisfaction: 0.1 },
      { score: 0.800000000001, meanSatisfaction: 0.95, startMs: 30 },
      { startMs: 10, rating: 1, placeId: "z" },
      { rating: 4.5, placeId: "z" },
      { placeId: "a" },
    ]) {
      expect(compareCandidates({ ...candidate, ...better }, candidate)).toBeLessThan(0);
    }
    expect(compareCandidates({ ...candidate, score: 0.800000000001 }, candidate)).toBe(0);
    expect(compareCandidates({ ...candidate, rating: null }, candidate)).toBeGreaterThan(0);
  });

  it("ranks independently of input order and caps distinct venues at twenty", () => {
    const venues = Array.from({ length: 24 }, (_, i) => venue(String(i).padStart(2, "0")));
    const expected = options(solverInput({ venues }));
    for (const permutation of [
      [...venues].reverse(),
      [...venues.slice(8), ...venues.slice(0, 8)],
    ]) {
      expect(options(solverInput({ venues: permutation }))).toEqual(expected);
    }
    expect(expected.map(({ rank }) => rank)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(new Set(expected.map(({ venueId }) => venueId)).size).toBe(20);
    const input = solverInput({ venues });
    expect(options({ ...input, options: { ...input.options, maxOptions: 2 } })).toHaveLength(2);
  });

  it.each<[string[][], string[], number]>([
    [
      [
        ["a", "18:00", "20:00"],
        ["b", "18:00", "20:00"],
        ["c", "21:00", "23:00"],
      ],
      ["c"],
      90,
    ],
    [
      [
        ["a", "18:00", "20:00"],
        ["b", "21:00", "23:00"],
      ],
      ["a", "b"],
      90,
    ],
    [
      [
        ["a", "18:00", "20:00"],
        ["b", "21:00", "23:00"],
        ["c", "18:00", "23:00"],
      ],
      ["a", "b"],
      90,
    ],
    [
      [
        ["a", "12:00", "13:00"],
        ["b", "14:00", "15:00"],
        ["c", "16:00", "17:00"],
        ["d", "16:00", "17:00"],
      ],
      ["a", "b"],
      60,
    ],
    [
      [
        ["a", "18:00", "19:00"],
        ["b", "18:30", "20:00"],
      ],
      ["a"],
      90,
    ],
  ])("returns duration-aware outliers for %j", (windows, outlierMemberIds, durationMin) => {
    const members = windows.map(([id, from, to]) => availability(id!, from!, to!)).reverse();
    expect(solve(solverInput({ members, durationMin }))).toEqual({
      kind: "no_plan",
      reason: "no_time",
      outlierMemberIds,
    });
  });

  it("describes compromises using counts without leaking member IDs", () => {
    const outdoors = venue("park", { isOutdoor: true, priceTier: 3 });
    const ranked = options(
      solverInput({
        members: [member("Private Alice")],
        venues: [outdoors],
        weather: [forecast({ precipProbability: 40 })],
      }),
    );
    expect(ranked[0]?.compromise).toBe(
      "Stretches the budget for 1 person · Outdoor — 40% chance of rain",
    );
    expect(JSON.stringify(ranked)).not.toContain("Private Alice");
    expect(
      compromiseText({ budgetStretched: 2, travelStretched: 1, venue: outdoors, slot: null }),
    ).toBe("Stretches the budget for 2 people · Longer trip for 1 person");
  });
});
