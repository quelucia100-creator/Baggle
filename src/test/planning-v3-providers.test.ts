import { describe, expect, it, vi } from "vitest";
import { googleRoutes } from "@/lib/planning-v3/routes.server";
import { discoverGooglePlaces, normalizeGooglePlace } from "@/lib/planning-v3/places.server";
import { fetchV3Weather } from "@/lib/planning-v3/weather.server";
import type { RouteQuery } from "@/lib/planning-v3/travel";
import { clock, day, destination, iso, now, point, venue } from "./planning-v3-fixtures";

const at = clock("01:00", 1);
const defaultQuery: RouteQuery = {
  from: point,
  to: destination,
  mode: "walk",
  at,
  earliest: at - 30 * 60_000,
  timing: "depart",
};
const response = (duration = "600s") =>
  Response.json([{ status: {}, condition: "ROUTE_EXISTS", duration }]);
function requests(call: typeof fetch) {
  return vi.fn<typeof fetch>(call);
}
const duration = 600_000;

describe("Google route adapter", () => {
  it("uses the linked connector for a real route response without a direct Google key", async () => {
    const request = requests(async () => response());
    const provider = googleRoutes({ key: "connection-key", gatewayToken: "gateway-token", request });
    expect(await provider.route(defaultQuery)).toEqual({ start: at, end: at + duration });
    expect(request).toHaveBeenCalledWith(
      "https://connector-gateway.lovable.dev/google_maps/routes/distanceMatrix/v2:computeRouteMatrix",
      expect.objectContaining({ redirect: "manual" }),
    );
    const headers = new Headers(request.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer gateway-token");
    expect(headers.get("X-Connection-Api-Key")).toBe("connection-key");
    expect(headers.has("X-Goog-Api-Key")).toBe(false);
  });

  it("never calls the provider without both connector credentials", async () => {
    const request = requests(async () => response());
    expect(await googleRoutes({ key: "connection-key", request }).route(defaultQuery)).toBeNull();
    expect(await googleRoutes({ gatewayToken: "gateway-token", request }).route(defaultQuery)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("reports a Routes permission failure instead of inventing a route and stops retrying", async () => {
    const request = requests(async () => Response.json({ error: { details: [{ reason: "API_KEY_SERVICE_BLOCKED" }] } }, { status: 403 }));
    const provider = googleRoutes({ key: "connection-key", gatewayToken: "gateway-token", request });
    expect(await provider.route(defaultQuery)).toBeNull();
    expect(provider.failure).toContain("enable Routes API");
    expect(await provider.route({ ...defaultQuery, mode: "bike" })).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("batches walk origins, memoizes request-local legs, and uses traffic timed driving", async () => {
    const fetch = requests(async () =>
      Response.json([
        { condition: "ROUTE_EXISTS", duration: "600s" },
        { destinationIndex: 1, condition: "ROUTE_EXISTS", duration: "300s" },
      ]),
    );
    const provider = googleRoutes({ key: "key", gatewayToken: "gateway-token", request: fetch });
    const other = { lat: 45.53, lng: -73.58 };
    const walking = [
      provider.route({ ...defaultQuery, from: destination, to: point }),
      provider.route({ ...defaultQuery, from: destination, to: other }),
    ];
    expect(await Promise.all(walking)).toEqual([
      { start: at, end: at + duration },
      { start: at, end: at + duration / 2 },
    ]);
    expect(fetch).toHaveBeenCalled();
    const before = fetch.mock.calls.length;
    await provider.route({ ...defaultQuery, from: destination, to: point, at: at + duration });
    expect(fetch.mock.calls).toHaveLength(before);
    await provider.route({ ...defaultQuery, mode: "drive" });
    const drive = JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body));
    expect(drive).toMatchObject({
      travelMode: "DRIVE",
      departureTime: iso(at),
      routingPreference: "TRAFFIC_AWARE",
    });
  });

  it("uses routes for cycling and verifies transit times separately after midnight", async () => {
    const fetch = requests(async (path) => {
      if (String(path).includes("Matrix")) return response();
      return Response.json({
        routes: [
          {
            duration: "600s",
            legs: [
              {
                steps: [
                  {
                    travelMode: "TRANSIT",
                    transitDetails: {
                      stopDetails: {
                        departureTime: iso(at + 60_000),
                        arrivalTime: iso(at + duration),
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      });
    });
    const provider = googleRoutes({ key: "key", gatewayToken: "gateway-token", request: fetch });
    expect(await provider.route({ ...defaultQuery, mode: "bike" })).toEqual({
      start: at,
      end: at + duration,
    });
    expect(fetch.mock.calls[0]?.[0]).toContain("computeRoutes");
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      travelMode: "BICYCLE",
    });
    expect(await provider.route({ ...defaultQuery, mode: "transit" })).toEqual({
      start: at,
      end: at + duration,
    });
    expect(
      await provider.route({
        ...defaultQuery,
        mode: "transit",
        timing: "arrive",
        at: at + duration,
      }),
    ).toEqual({ start: at, end: at + duration });
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({
      departureTime: iso(at),
    });
    expect(JSON.parse(String(fetch.mock.calls[3]?.[1]?.body))).toMatchObject({
      arrivalTime: iso(at + duration),
    });
  });

  it("rejects walk-only transit, fallback, rate limits and exhausted quota", async () => {
    const fetch = requests(async (path) =>
      String(path).includes("Matrix")
        ? response()
        : Response.json({
            routes: [
              {
                duration: "600s",
                legs: [{ steps: [{ travelMode: "WALK", staticDuration: "600s" }] }],
              },
            ],
          }),
    );
    expect(
      await googleRoutes({ key: "key", gatewayToken: "gateway-token", request: fetch }).route({
        ...defaultQuery,
        mode: "transit",
      }),
    ).toBeNull();
    const fallback = requests(async () =>
      Response.json([{ condition: "ROUTE_EXISTS", duration: "600s", fallbackInfo: {} }]),
    );
    expect(await googleRoutes({ key: "key", gatewayToken: "gateway-token", request: fallback }).route(defaultQuery)).toBeNull();
    const limited = googleRoutes({ key: "key", gatewayToken: "gateway-token", request: fetch, maxCalls: 0 });
    expect(await limited.route(defaultQuery)).toBeNull();
    expect(limited.limited).toBe(true);
    const unavailable = requests(async () => new Response(null, { status: 429 }));
    const provider = googleRoutes({ key: "key", gatewayToken: "gateway-token", request: unavailable });
    expect(await provider.route(defaultQuery)).toBeNull();
    expect(await provider.route({ ...defaultQuery, mode: "bike" })).toBeNull();
    expect(unavailable).toHaveBeenCalledTimes(1);
  });
});

describe("V3 venue and weather sources", () => {
  const place = {
    id: "place",
    displayName: { text: "Museum" },
    formattedAddress: "42 Museum Street",
    googleMapsUri: "https://maps.google.com",
    location: { latitude: 45.52, longitude: -73.58 },
    businessStatus: "OPERATIONAL",
    primaryType: "museum",
    utcOffsetMinutes: -300,
    priceLevel: "PRICE_LEVEL_FREE",
    currentOpeningHours: {
      periods: [
        {
          open: { date: { year: 2026, month: 11, day: 23 }, hour: 10, minute: 0 },
          close: { date: { year: 2026, month: 11, day: 23 }, hour: 17, minute: 0 },
        },
      ],
    },
    accessibilityOptions: { wheelchairAccessibleEntrance: true },
    attributions: [{ provider: "Museum", providerUri: "https://example.org" }],
  };
  it("uses dated special hours and keeps tiers, booking, and inferred requirements unknown", () => {
    expect(normalizeGooglePlace(place, now)).toMatchObject({
      opening: [{ start: clock("10:00"), end: clock("17:00") }],
      source: "google_places",
      sourceTimestamp: iso(now),
      cost: null,
      bookingRequired: "unknown",
      under18Allowed: null,
      alcoholFree: null,
      accessibility: ["wheelchair_accessible_entrance"],
      dietary: [],
      attribution: [
        { name: "Google Maps", url: "https://maps.google.com" },
        { name: "Museum", url: "https://example.org" },
      ],
    });
    expect(
      normalizeGooglePlace(
        {
          ...place,
          currentOpeningHours: undefined,
          regularOpeningHours: place.currentOpeningHours,
        },
        now,
      ),
    ).toBeNull();
    expect(
      normalizeGooglePlace({ ...place, currentOpeningHours: { periods: [] } }, now)?.opening,
    ).toEqual([]);
  });
  it("uses a restrictive field mask and returns no trustable facts on provider outage", async () => {
    const fetch = requests(async () => Response.json({ places: [place] }));
    expect(await discoverGooglePlaces(point, "key", now, fetch)).toHaveLength(1);
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get("X-Goog-FieldMask")).toContain("currentOpeningHours.periods");
    expect(headers.get("X-Goog-FieldMask")).not.toMatch(/priceLevel|\*/);
    const offline = requests(async () => new Response(null, { status: 503 }));
    expect(await discoverGooglePlaces(point, "key", now, offline)).toEqual([]);
    expect((await fetchV3Weather([venue()], [day], offline)).size).toBe(0);
  });
});
