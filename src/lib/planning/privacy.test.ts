import { beforeEach, describe, expect, it, vi } from "vitest";
import { solvePlans } from "./solver";
import { planningStateSchema, toPublicPlanOptions } from "./types";
import type { Snapshot, Venue } from "./types";

const area = { lat: 45.5, lng: -73.57 };
const members: Snapshot["members"] = [
  { id: "11111111-1111-4111-8111-111111111111", budget: 0, maxTravelMin: 30, freeFrom: "18:00", freeTo: "22:00", origin: null },
  { id: "22222222-2222-4222-8222-222222222222", budget: 4, maxTravelMin: 30, freeFrom: "18:00", freeTo: "22:00", origin: null },
];
const snapshot: Snapshot = { config: { date: "2026-11-22", durationMin: 90, area, areaLabel: "Montreal", category: "park" }, members };
const venue: Venue = { placeId: "pricey", name: "Pricey", category: "park", priceTier: 4, location: area, hours: null,
  outdoor: false, season: null, rating: 4, mapsUrl: "https://www.google.com/maps/search/?api=1&query=Montreal" };

describe("Shared plan privacy", () => {
  it("removes the min-satisfaction score that lets a member solve for another member's budget", () => {
    // Arrange: in a 2-person party the score of a tier-4 venue equals 1 - (4 - otherBudget) / 4.
    const ranked = solvePlans(snapshot, [venue]).options;
    expect(ranked[0]?.score).toBe(0);
    // Act
    const shared = toPublicPlanOptions(ranked);
    // Assert
    expect(shared).toHaveLength(ranked.length);
    expect(shared.every((option) => !("score" in option))).toBe(true);
    expect(shared[0]?.venue.placeId).toBe("pricey");
  });

  it("does not surface a score from a stored plan in the server-function response", () => {
    const [ranked] = solvePlans(snapshot, [venue]).options;
    const state = planningStateSchema.parse({ status: "locked", revision: 1, selfPreferences: null, members: [],
      config: snapshot.config, plan: ranked, planIndex: 0, optionCount: 1, groupRerollsUsed: 0, votes: 0,
      voteThreshold: 1, selfVoted: false, outlierCount: 0, venueSource: "fallback" });
    expect(state.plan).not.toHaveProperty("score");
  });
});

const rpc = vi.fn(); const adminRpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: adminRpc } }));
vi.mock("./forecast.server", () => ({ fetchPlanningForecast: vi.fn(async () => []) }));
vi.mock("./places.server", () => ({ fetchPlanningVenues: vi.fn(async () => []) }));

describe("Planning persistence boundary", () => {
  const lease = "33333333-3333-4333-8333-333333333333";
  const baseState = { status: "locking", revision: 1, selfPreferences: null, members: [], config: snapshot.config, plan: null,
    planIndex: 0, optionCount: 0, groupRerollsUsed: 0, votes: 0, voteThreshold: 1, selfVoted: false, outlierCount: 0, venueSource: null };
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://example.invalid"); vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    rpc.mockReset(); adminRpc.mockReset();
    rpc.mockResolvedValueOnce({ data: { ...baseState, acquired: true, lease }, error: null })
      .mockResolvedValueOnce({ data: { ...baseState, status: "locked" }, error: null });
    adminRpc.mockImplementation(async (fn: string) => fn === "party_plan_snapshot" ? { data: snapshot, error: null } : { data: true, error: null });
  });

  it.each(["fallback", "google_places"])("stores %s options without per-plan scores", async (source) => {
    const { fetchPlanningVenues } = await import("./places.server");
    vi.mocked(fetchPlanningVenues).mockResolvedValueOnce(source === "google_places" ? [venue] : []);
    const { executePlanning } = await import("./service.server");
    await executePlanning({ action: "lock", code: "ABC123", token: "a".repeat(64), payload: {} });
    const completion = adminRpc.mock.calls.find(([fn]) => fn === "party_plan_complete");
    const result = completion?.[1] as { p_options: object[]; p_source: string };
    expect(result.p_source).toBe(source);
    const stored = result.p_options;
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.every((option) => !("score" in option))).toBe(true);
  });
});
