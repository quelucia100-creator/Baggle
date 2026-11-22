import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), route: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: (validate: (input: unknown) => unknown) => ({
      handler:
        (handler: (input: { data: unknown }) => unknown) => async (input: { data: unknown }) =>
          handler({ data: validate(input.data) }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("./journey-routes.server", () => ({ fetchJourneyRoutes: mocks.route }));
import { getJourneyRoutes } from "./journey-routes.functions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://test.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-public");
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-connection");
  vi.stubEnv("LOVABLE_API_KEY", "test-gateway");
});
afterEach(() => vi.unstubAllEnvs());

describe("Route capability boundary", () => {
  it("denies requests without valid membership before any billable call", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Invalid capability" } });
    await expect(
      getJourneyRoutes({ data: { code: "ABC123", token: "a".repeat(64), mode: "WALK" } }),
    ).rejects.toThrow("Join this party");
    expect(mocks.route).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects caller-supplied destination or private origins", async () => {
    const malicious = {
      code: "ABC123",
      token: "a".repeat(64),
      mode: "WALK" as const,
      destination: { lat: 1, lng: 1 },
    };
    await expect(getJourneyRoutes({ data: malicious })).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.route).not.toHaveBeenCalled();
  });
  it("routes from the verified public venue and device locations, excluding private answers", async () => {
    const party = {
      code: "ABC123",
      selfId: "host",
      isHost: true,
      started: false,
      view: "team",
      hangout: null,
      members: [
        {
          id: "host",
          name: "Alex",
          host: true,
          location: { lat: 45.5, lng: -73.6, updatedAt: "2026-11-22T15:23:00Z" },
        },
      ],
    };
    const destination = { lat: 45.52, lng: -73.57 };
    mocks.rpc
      .mockResolvedValueOnce({ data: party, error: null })
      .mockResolvedValueOnce({
        data: {
          status: "locked",
          revision: 4,
          plan: { venue: { location: destination } },
          selfPreferences: { originLat: 46, originLng: -74, budget: 4 },
        },
        error: null,
      });
    mocks.route.mockResolvedValue({ routes: [] });
    await getJourneyRoutes({ data: { code: "ABC123", token: "a".repeat(64), mode: "WALK" } });
    expect(mocks.route).toHaveBeenCalledWith({
      party,
      destination,
      revision: 4,
      mode: "WALK",
      gatewayKey: "test-gateway",
      mapsKey: "test-connection",
    });
    expect(JSON.stringify(mocks.route.mock.calls)).not.toContain("selfPreferences");
    expect(JSON.stringify(mocks.route.mock.calls)).not.toContain("originLat");
  });
  it("does not call Google before a locked or final plan exists", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: { code: "ABC123", selfId: "host", isHost: true, members: [] },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { status: "collecting", revision: 4, plan: null },
        error: null,
      });
    await expect(
      getJourneyRoutes({ data: { code: "ABC123", token: "a".repeat(64), mode: "WALK" } }),
    ).rejects.toThrow("once a shared plan is selected");
    expect(mocks.route).not.toHaveBeenCalled();
  });
});
