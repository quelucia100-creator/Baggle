import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPlanningVenues } from "./places.server";
import { openForSlot } from "./solver";
import { wallTime } from "./tz";
import type { PlanningConfig } from "./types";

const area = { lat: 45.5, lng: -73.57 };
const config = { area, category: "restaurant" } as const;
const sample = { id: "test-place", displayName: { text: "Sample venue" }, location: { latitude: 45.51, longitude: -73.58 } };

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
  vi.stubEnv("LOVABLE_API_KEY", "gateway-token");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Google Places Nearby Search", () => {
  it.each<[PlanningConfig["category"], string]>([
    ["park", "park"], ["cafe", "cafe"], ["museum", "museum"], ["restaurant", "restaurant"], ["activity", "bowling_alley"],
  ])("queries nearby %s venues using only the search centre", async (category, type) => {
    fetchMock.mockResolvedValue(Response.json({ places: [sample] }));
    const [venue] = await fetchPlanningVenues({ area, category });
    expect(venue).toMatchObject({ category, outdoor: category === "park", hours: null, rating: null, priceTier: null, season: null });
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("Expected a venue lookup");
    const [url, init] = call;
    expect(url).toBe("https://connector-gateway.lovable.dev/google_maps/places/v1/places:searchNearby");
    expect(init).toMatchObject({ method: "POST", redirect: "manual", headers: { "X-Connection-Api-Key": "test-key", Authorization: "Bearer gateway-token" } });
    expect(new Headers(init?.headers).has("X-Goog-Api-Key")).toBe(false);
    expect(new Headers(init?.headers).get("X-Goog-FieldMask")).toContain("places.regularOpeningHours");
    expect(JSON.parse(String(init?.body))).toEqual({
      includedTypes: expect.arrayContaining([type]), maxResultCount: 20,
      locationRestriction: { circle: { center: { latitude: area.lat, longitude: area.lng }, radius: 5000 } },
    });
  });

  it("maps weekly hours across midnight and the weekend, preserving multiple daily periods", async () => {
    fetchMock.mockResolvedValue(Response.json({ places: [{ ...sample, priceLevel: "PRICE_LEVEL_MODERATE", rating: 4.5,
      regularOpeningHours: { periods: [
        { open: { day: 6, hour: 21, minute: 0 }, close: { day: 0, hour: 2, minute: 30 } },
        { open: { day: 0, hour: 11, minute: 30 }, close: { day: 0, hour: 14, minute: 0 } },
      ] },
    }] }));
    const [venue] = await fetchPlanningVenues(config);
    expect(venue).toMatchObject({ placeId: sample.id, name: sample.displayName.text, priceTier: 2, rating: 4.5,
      location: { lat: 45.51, lng: -73.58 }, hours: {
        0: [{ open: "00:00", close: "02:30" }, { open: "11:30", close: "14:00" }],
        6: [{ open: "21:00", close: "24:00" }],
      },
    });
    expect(new URL(venue!.mapsUrl).searchParams.get("query_place_id")).toBe(sample.id);
    expect(openForSlot(venue!, wallTime("2026-11-21", "23:30"), wallTime("2026-11-22", "02:30"))).toBe(true);
    expect(openForSlot(venue!, wallTime("2026-11-22", "02:00"), wallTime("2026-11-22", "03:00"))).toBe(false);
  });

  it("preserves free, 24/7 and explicitly closed schedules", async () => {
    fetchMock.mockResolvedValue(Response.json({ places: [
      { ...sample, priceLevel: "PRICE_LEVEL_FREE", regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] } },
      { ...sample, id: "never-open", regularOpeningHours: { periods: [] } },
    ] }));
    const [alwaysOpen, neverOpen] = await fetchPlanningVenues(config);
    expect(alwaysOpen?.priceTier).toBe(0);
    expect(Object.values(alwaysOpen!.hours!)).toEqual(Array.from({ length: 7 }, () => [{ open: "00:00", close: "24:00" }]));
    expect(neverOpen?.hours).toEqual({});
  });

  it("skips invalid, duplicate and closed places while preserving usable partial data", async () => {
    fetchMock.mockResolvedValue(Response.json({ places: [
      { ...sample, location: { latitude: 100, longitude: 0 } },
      { ...sample, id: "closed", businessStatus: "CLOSED_TEMPORARILY" },
      { ...sample, id: "permanent", businessStatus: "CLOSED_PERMANENTLY" },
      { ...sample, id: "future", businessStatus: "FUTURE_OPENING" },
      { ...sample, priceLevel: "PRICE_LEVEL_UNSPECIFIED", rating: 7, regularOpeningHours: { periods: [{ open: { day: 1 } }] } },
      sample,
    ] }));
    const venues = await fetchPlanningVenues(config);
    expect(venues).toHaveLength(1);
    expect(venues[0]).toMatchObject({ placeId: sample.id, priceTier: null, rating: null, hours: null });
  });

  it("skips the request when the dedicated server credential is absent", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", undefined);
    expect(await fetchPlanningVenues(config)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([403, 429, 503])("falls back on HTTP %s in one attempt", async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    expect(await fetchPlanningVenues(config)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["{}", '{"places":[]}', '{"places":[null]}', '{"places":{}}', '{"error":{"status":"RESOURCE_EXHAUSTED"}}', "not JSON"])
    ("returns no live venues for %s", async (body) => {
      fetchMock.mockResolvedValue(new Response(body));
      expect(await fetchPlanningVenues(config)).toEqual([]);
    });

  it("falls back when the four-second request signal aborts", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    fetchMock.mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    }));
    const result = fetchPlanningVenues(config);
    controller.abort();
    expect(timeout).toHaveBeenCalledWith(4000);
    expect(await result).toEqual([]);
  });
});
