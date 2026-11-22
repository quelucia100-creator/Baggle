import { describe, expect, it } from "vitest";
import { googleRoutes } from "@/lib/planning-v3/routes.server";
import { modes } from "@/lib/planning-v3/schema";
import { localDay, MINUTE_MS, shiftDate, wallTime } from "@/lib/planning/tz";

describe.skipIf(process.env["PLANNING_LIVE_ROUTES_TESTS"] !== "1")("Live Google Routes", () => {
  it.each(modes)("verifies a Montreal %s round trip", async (mode) => {
    const key = process.env["GOOGLE_ROUTES_API_KEY"];
    if (!key) throw new Error("Set GOOGLE_ROUTES_API_KEY in the test process.");

    // The walk probe uses the pilot's rounded Lachine preset and the exhibition venue.
    // The other modes use public downtown landmarks. No member data is sent.
    const from = mode === "walk" ? { lat: 45.44, lng: -73.69 } : { lat: 45.5048, lng: -73.5737 };
    const to =
      mode === "walk" ? { lat: 45.433338, lng: -73.68961 } : { lat: 45.5291, lng: -73.5521 };
    const day = shiftDate(localDay(Date.now()).date, 1);
    const arrival = wallTime(day, "14:00");
    const returnDeparture = wallTime(day, "15:00");
    const earliest = arrival - 90 * MINUTE_MS;
    const provider = googleRoutes({ key, maxCalls: 5, maxElements: 5 });

    const [outbound, returning] = await Promise.all([
      provider.route({ from, to, mode, timing: "arrive", at: arrival, earliest }),
      provider.route({
        from: to,
        to: from,
        mode,
        timing: "depart",
        at: returnDeparture,
        earliest: returnDeparture,
      }),
    ]);
    if (!outbound || !returning) throw new Error(`No verified ${mode} round trip was returned.`);
    expect(outbound.start).toBeGreaterThanOrEqual(earliest);
    expect(outbound.end).toBeGreaterThan(outbound.start);
    expect(outbound.end).toBeLessThanOrEqual(arrival);
    expect(returning.start).toBeGreaterThanOrEqual(returnDeparture);
    expect(returning.end).toBeGreaterThan(returning.start);
  });
});
