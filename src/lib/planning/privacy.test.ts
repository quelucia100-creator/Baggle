import { describe, expect, it } from "vitest";
import { NEUTRAL_COMPROMISE, solvePlans } from "./solver";
import { planningStateSchema, publicPlanOptionSchema, toPublicPlanOptions } from "./types";
import type { Snapshot, Venue } from "./types";

const area = { lat: 45.5, lng: -73.57 };
const member = (id: string, budget: number, maxTravelMin: number) => ({ id, budget, maxTravelMin, freeFrom: "18:00", freeTo: "22:00", origin: null });
const config = { date: "2026-11-22", durationMin: 90, area, areaLabel: "Montreal", category: "park" };
const venue: Venue = { placeId: "pricey", name: "Pricey", category: "park", priceTier: 4, location: area, hours: null,
  outdoor: true, season: null, rating: 4, mapsUrl: "https://www.google.com/maps/search/?api=1&query=Montreal" };

describe("Shared plan privacy", () => {
  it("uses the same compromise text whatever members' budgets or travel limits are", () => {
    const tight = solvePlans({ config, members: [member("11111111-1111-4111-8111-111111111111", 0, 5), member("22222222-2222-4222-8222-222222222222", 0, 5)] } as Snapshot, [venue]).options;
    const loose = solvePlans({ config, members: [member("11111111-1111-4111-8111-111111111111", 4, 90), member("22222222-2222-4222-8222-222222222222", 4, 90)] } as Snapshot, [venue]).options;
    expect(tight.length).toBeGreaterThan(0);
    expect([...tight, ...loose].every((o) => o.compromise === "Review this option")).toBe(true);
    expect(NEUTRAL_COMPROMISE).toBe("Review this option");
  });
  it("drops the score and forces neutral text in stored options", () => {
    const [ranked] = solvePlans({ config, members: [member("11111111-1111-4111-8111-111111111111", 0, 30), member("22222222-2222-4222-8222-222222222222", 4, 30)] } as Snapshot, [venue]).options;
    if (!ranked) throw new Error("Expected an option");
    const [shared] = toPublicPlanOptions([{ ...ranked, compromise: "Stretches the budget for 1 person" }]);
    expect(shared).not.toHaveProperty("score");
    expect(shared?.compromise).toBe("Review this option");
  });
  it("rejects public options carrying private compromise text", () => {
    expect(publicPlanOptionSchema.safeParse({ venue: { placeId: "x", name: "X", category: "park", priceTier: 1, location: area, mapsUrl: venue.mapsUrl, outdoor: false },
      startAt: "2026-11-22T23:00:00.000Z", endAt: "2026-11-23T00:30:00.000Z", compromise: "Longer travel for 1 person", hoursUnknown: false, weather: null }).success).toBe(false);
  });
  it("accepts only the single neutral no-plan reason", () => {
    const base = { status: "no_plan", revision: 1, selfPreferences: null, members: [], config, plan: null, planIndex: 0, optionCount: 0,
      groupRerollsUsed: 0, votes: 0, voteThreshold: 1, selfVoted: false, venueSource: null };
    expect(planningStateSchema.safeParse({ ...base, noPlanReason: "no_match" }).success).toBe(true);
    expect(planningStateSchema.safeParse({ ...base, noPlanReason: "no_overlap" }).success).toBe(false);
  });
});
