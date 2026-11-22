import { describe, expect, it } from "vitest";
import { solvePlans } from "./solver";
import {
  NEUTRAL_COMPROMISE,
  planningStateSchema,
  publicPlanOptionSchema,
  toPublicPlanOptions,
} from "./types";
import type { Snapshot, Venue } from "./types";

const area = { lat: 45.5, lng: -73.57 };
const config = {
  date: "2026-11-22",
  durationMin: 90,
  area,
  areaLabel: "Montreal",
  category: "park",
} as const;
const members = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    budget: 0,
    maxTravelMin: 5,
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
];
const snapshot: Snapshot = { config, members };
const venue: Venue = {
  placeId: "park",
  name: "Park",
  category: "park",
  priceTier: 0,
  location: area,
  hours: { 0: [{ open: "06:00", close: "24:00" }] },
  outdoor: false,
  season: null,
  rating: 4,
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Montreal",
};
const legacyMessage = "Longer travel for 1 person";
const now = Date.parse("2026-11-22T12:00:00Z");
const state = {
  status: "locked",
  revision: 1,
  selfPreferences: null,
  members: [],
  config,
  plan: null,
  planIndex: 0,
  optionCount: 1,
  groupRerollsUsed: 0,
  votes: 0,
  voteThreshold: 1,
  selfVoted: false,
  noPlanReason: null,
  venueSource: "fallback",
};

function rankedOption() {
  const [option] = solvePlans(snapshot, [venue], [], now).options;
  if (!option) throw new Error("Expected a feasible option");
  return option;
}

describe("Shared plan privacy", () => {
  it("uses neutral text for feasible options with different member limits", () => {
    const loose = {
      ...snapshot,
      members: members.map((member) => ({ ...member, budget: 4, maxTravelMin: 90 })),
    };
    const options = solvePlans(loose, [venue], [], now).options;
    expect(options.length).toBeGreaterThan(0);
    expect(
      [rankedOption(), ...options].every((option) => option.compromise === NEUTRAL_COMPROMISE),
    ).toBe(true);
  });

  it("drops internal scores and forces neutral text before storage", () => {
    const option = rankedOption();
    expect(option.score).toBe(1);
    const [shared] = toPublicPlanOptions([{ ...option, compromise: legacyMessage }]);
    expect(shared).not.toHaveProperty("score");
    expect(shared?.compromise).toBe(NEUTRAL_COMPROMISE);
    expect(shared?.venue.placeId).toBe(venue.placeId);
  });

  it("omits private fields even when a stored row includes them", () => {
    const plan = {
      ...rankedOption(),
      mean: 0.5,
      venue: { ...rankedOption().venue, unpublished: true },
    };
    const result = planningStateSchema.parse({
      ...state,
      plan,
      outlierCount: 1,
      outlierNames: ["Member"],
      lease: "private",
    });
    expect(result.plan).not.toHaveProperty("score");
    expect(result.plan).not.toHaveProperty("mean");
    expect(result.plan?.venue).not.toHaveProperty("unpublished");
    expect(result).not.toHaveProperty("outlierCount");
    expect(result).not.toHaveProperty("outlierNames");
    expect(result).not.toHaveProperty("lease");
  });

  it("rejects a public option carrying private compromise text", () => {
    expect(
      publicPlanOptionSchema.safeParse({ ...rankedOption(), compromise: legacyMessage }).success,
    ).toBe(false);
  });

  it("accepts only the generic no-plan reason", () => {
    const noPlan = { ...state, status: "no_plan", optionCount: 0 };
    expect(planningStateSchema.safeParse({ ...noPlan, noPlanReason: "no_match" }).success).toBe(
      true,
    );
    expect(planningStateSchema.safeParse({ ...noPlan, noPlanReason: "no_overlap" }).success).toBe(
      false,
    );
  });
});
