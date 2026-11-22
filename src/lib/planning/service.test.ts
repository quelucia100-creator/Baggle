import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executePlanning } from "./service.server";
import { FALLBACK_VENUES } from "./venues";
import { configSchema } from "./types";

const { partyRpc, adminRpc } = vi.hoisted(() => ({ partyRpc: vi.fn(), adminRpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: partyRpc }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: adminRpc } }));
vi.mock("./forecast.server", () => ({ fetchPlanningForecast: async () => [] }));

const config = {
  date: "2026-11-21",
  durationMin: 60,
  areaLabel: "Montréal",
  area: { lat: 45.5, lng: -73.57 },
  category: "restaurant",
} as const;
const members = [
  "b60b7dc8-c348-48e7-8791-02907c014a75",
  "6302c3d8-f528-4331-a4a6-863df58018c9",
].map((id) => ({
  id,
  budget: 2,
  freeFrom: "18:00",
  freeTo: "20:00",
  maxTravelMin: 30,
  origin: null,
}));
const lease = "ced6368d-58f9-4422-9188-d629a7f2b0ee";
const command = { action: "lock", code: "ABC123", token: "a".repeat(64), payload: {} } as const;
const state = {
  status: "locking",
  revision: 0,
  selfPreferences: null,
  members: [],
  config,
  plan: null,
  planIndex: 0,
  optionCount: 0,
  groupRerollsUsed: 0,
  votes: 0,
  voteThreshold: 0,
  selfVoted: false,
  noPlanReason: null,
  venueSource: null,
};
const place = {
  id: "live-restaurant",
  displayName: { text: "Mock restaurant" },
  location: { latitude: 45.51, longitude: -73.58 },
  priceLevel: "PRICE_LEVEL_MODERATE",
  regularOpeningHours: {
    periods: [{ open: { day: 6, hour: 17, minute: 0 }, close: { day: 6, hour: 21, minute: 0 } }],
  },
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-key");
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-places-key");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  partyRpc
    .mockReset()
    .mockResolvedValueOnce({ data: { ...state, acquired: true, lease } })
    .mockResolvedValueOnce({ data: state });
  adminRpc
    .mockReset()
    .mockResolvedValueOnce({ data: { config, members } })
    .mockResolvedValueOnce({ data: true });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const storedOptions = () =>
  (
    adminRpc.mock.calls.find(([fn]) => fn === "party_plan_complete")?.[1] as {
      p_options: Array<Record<string, unknown>>;
    }
  ).p_options;
const expectPublicOptions = () => {
  const options = storedOptions();
  expect(options.length).toBeGreaterThan(0);
  expect(options.every((o) => !("score" in o) && o["compromise"] === "Review this option")).toBe(
    true,
  );
};
describe("Planning venue selection", () => {
  it("stores a live ranking with the existing planning lease", async () => {
    fetchMock.mockResolvedValue(Response.json({ places: [place] }));
    await executePlanning(command);
    expect(adminRpc).toHaveBeenNthCalledWith(
      2,
      "party_plan_complete",
      expect.objectContaining({
        p_lease: lease,
        p_source: "google_places",
        p_options: expect.arrayContaining([
          expect.objectContaining({ venue: expect.objectContaining({ placeId: place.id }) }),
        ]),
      }),
    );
    expectPublicOptions();
  });

  it.each([
    ["quota limit", () => new Response(null, { status: 429 })],
    ["empty response", () => Response.json({})],
    [
      "no open slots",
      () => Response.json({ places: [{ ...place, regularOpeningHours: { periods: [] } }] }),
    ],
    ["unknown price", () => Response.json({ places: [{ ...place, priceLevel: undefined }] })],
    [
      "unknown hours",
      () => Response.json({ places: [{ ...place, regularOpeningHours: undefined }] }),
    ],
    [
      "over budget",
      () => Response.json({ places: [{ ...place, priceLevel: "PRICE_LEVEL_EXPENSIVE" }] }),
    ],
    [
      "over travel limit",
      () =>
        Response.json({ places: [{ ...place, location: { latitude: 45.57, longitude: -73.58 } }] }),
    ],
  ])("stores the catalogue ranking after a Places %s", async (_scenario, makeResponse) => {
    fetchMock.mockResolvedValue(makeResponse());
    await executePlanning(command);
    expect(adminRpc).toHaveBeenNthCalledWith(
      2,
      "party_plan_complete",
      expect.objectContaining({
        p_lease: lease,
        p_source: "fallback",
        p_options: expect.arrayContaining([
          expect.objectContaining({
            venue: expect.objectContaining({ placeId: "fallback:la-banquise" }),
          }),
        ]),
      }),
    );
    expectPublicOptions();
  });

  it("skips the providers when another request already holds the lease", async () => {
    partyRpc.mockReset().mockResolvedValue({ data: { ...state, acquired: false, lease: null } });
    const result = await executePlanning(command);
    expect(result).toEqual(state);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it.each(configSchema.shape.category.options)(
    "uses only verified fallback facts for %s",
    async (category) => {
      vi.stubEnv("GOOGLE_PLACES_API_KEY", undefined);
      adminRpc
        .mockReset()
        .mockResolvedValueOnce({
          data: {
            config: { ...config, category },
            members: members.map((member) => ({ ...member, freeFrom: "13:00", freeTo: "15:00" })),
          },
        })
        .mockResolvedValueOnce({ data: true });
      expect(
        FALLBACK_VENUES.filter((venue) => venue.category === category).length,
      ).toBeGreaterThanOrEqual(2);
      const feasible = category === "park" || category === "restaurant";
      if (!feasible) {
        partyRpc
          .mockReset()
          .mockResolvedValueOnce({ data: { ...state, acquired: true, lease } })
          .mockResolvedValueOnce({
            data: { ...state, status: "no_plan", noPlanReason: "no_match" },
          });
      }
      const result = await executePlanning(command);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(adminRpc).toHaveBeenNthCalledWith(
        2,
        "party_plan_complete",
        expect.objectContaining({
          p_source: "fallback",
          p_options: feasible
            ? expect.arrayContaining([
                expect.objectContaining({
                  venue: expect.objectContaining({
                    placeId: expect.stringMatching(/^fallback:/),
                    category,
                  }),
                }),
              ])
            : [],
        }),
      );
      if (!feasible)
        expect(result).toMatchObject({ status: "no_plan", noPlanReason: "no_match", plan: null });
    },
  );

  it("uses the acquired lease to reset a failed computation", async () => {
    adminRpc
      .mockReset()
      .mockResolvedValueOnce({ error: { message: "Snapshot unavailable" } })
      .mockResolvedValueOnce({ data: true });
    await expect(executePlanning(command)).rejects.toThrow("preferences are saved");
    expect(adminRpc).toHaveBeenNthCalledWith(2, "party_plan_complete", {
      p_code: command.code,
      p_lease: lease,
      p_failed: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["vote", "host_reroll"] as const)("uses the stored ranking for %s", async (action) => {
    partyRpc.mockReset().mockResolvedValueOnce({ data: { ...state, status: "locked" } });
    await executePlanning({ ...command, action, payload: { revision: 3 } });
    expect(partyRpc).toHaveBeenCalledWith(
      "party_plan",
      expect.objectContaining({ p_action: action, p_payload: { revision: 3 } }),
    );
    expect(adminRpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
