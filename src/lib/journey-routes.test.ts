import { describe, expect, it, vi } from "vitest";
import { fetchJourneyRoutes } from "./journey-routes.server";
import type { PartyState } from "./party";

function crew(code: string, count: number): PartyState {
  return {
    code,
    selfId: "member-0",
    isHost: true,
    started: false,
    view: "team",
    hangout: null,
    members: Array.from({ length: count }, (_, index) => ({
      id: `member-${index}`,
      name: "Member",
      host: index === 0,
      location: { lat: 45.5 + index / 100, lng: -73.5, updatedAt: "2026-11-22T15:23:00Z" },
    })),
  };
}
const destination = { lat: 45.52, lng: -73.57 };
const options = {
  destination,
  revision: 4,
  mode: "WALK" as const,
  gatewayKey: "test-gateway",
  mapsKey: "test-connection",
};
const route = () =>
  Response.json({
    routes: [
      { distanceMeters: 1200, duration: "600.5s", polyline: { encodedPolyline: "test-polyline" } },
    ],
  });

describe("Bounded shared route requests", () => {
  it("caps the crew at ten requests and two concurrent calls, caching duplicate requests", async () => {
    let active = 0;
    let peak = 0;
    const request = vi.fn<typeof fetch>(async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return route();
    });
    const party = crew("CAP123", 12);
    const result = await fetchJourneyRoutes({ ...options, party, request });
    expect(request).toHaveBeenCalledTimes(10);
    expect(peak).toBe(2);
    expect(result.routes).toHaveLength(10);
    expect(result.routes[0]?.durationSeconds).toBe(600.5);
    await fetchJourneyRoutes({ ...options, party, request });
    expect(request).toHaveBeenCalledTimes(10);
  });
  it("skips members who have not shared their device location", async () => {
    const request = vi.fn<typeof fetch>(async () => route());
    const party = crew("NON123", 1);
    party.members = party.members.map((member) => ({ ...member, location: null }));
    expect((await fetchJourneyRoutes({ ...options, party, request })).routes).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });
  it("does not invent a route when the provider supplies no geometry", async () => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ routes: [{ duration: "5s" }] }),
    );
    const result = await fetchJourneyRoutes({ ...options, party: crew("BAD123", 1), request });
    expect(result.routes).toEqual([]);
    expect(result.unavailable).toBe(1);
  });
  it("stops further batches on a permission failure", async () => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json(
        { error: { details: [{ reason: "API_KEY_SERVICE_BLOCKED" }] } },
        { status: 403 },
      ),
    );
    await expect(
      fetchJourneyRoutes({ ...options, party: crew("DEN123", 10), request }),
    ).rejects.toThrow("Add Routes API");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
