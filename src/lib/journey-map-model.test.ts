import { describe, expect, it } from "vitest";
import { googleRouteSchema, memberInitials, routeMatchesDestination } from "./journey-map-model";

describe("Shared map rules", () => {
  it("limits initials to two letters", () => {
    expect(memberInitials("Alex Misha Zin")).toBe("AM");
    expect(memberInitials("  Lucia   Que ")).toBe("LQ");
    expect(memberInitials("Alex")).toBe("A");
  });
  it("preserves fractional route durations and protobuf zero distance", () => {
    const result = googleRouteSchema.parse({
      routes: [{ duration: "12.5s", polyline: { encodedPolyline: "abc" } }],
    });
    expect(result.routes[0]?.duration).toBe(12.5);
    expect(result.routes[0]?.distanceMeters).toBe(0);
  });
  it("rejects incomplete geometry and malformed durations", () => {
    expect(googleRouteSchema.safeParse({ routes: [{ duration: "12s" }] }).success).toBe(false);
    expect(
      googleRouteSchema.safeParse({
        routes: [{ duration: "NaNs", polyline: { encodedPolyline: "abc" } }],
      }).success,
    ).toBe(false);
  });
  it("never reuses routes for a different plan location", () => {
    const result = {
      destination: { lat: 45.5, lng: -73.5 },
      revision: 1,
      routes: [],
      unavailable: 0,
    };
    expect(routeMatchesDestination(result, { lat: 45.5, lng: -73.5 })).toBe(true);
    expect(routeMatchesDestination(result, { lat: 45.6, lng: -73.5 })).toBe(false);
  });
});
