import "@tanstack/react-start/server-only";
import type { PartyState } from "./party";
import { googleRouteSchema, type JourneyRoutes, type MapPoint } from "./journey-map-model";

type Options = {
  party: PartyState;
  destination: MapPoint;
  revision: number;
  mode: "WALK" | "BICYCLE" | "DRIVE" | "TRANSIT";
  gatewayKey: string;
  mapsKey: string;
  request?: typeof fetch;
};
// Ephemeral bounded cache. Membership is reverified before every lookup.
// Never persists coordinates, tokens or routes in tables or shared browser caches.
const cache = new Map<
  string,
  { expires: number; result: Promise<Omit<JourneyRoutes, "revision">> }
>();

export async function fetchJourneyRoutes({
  party,
  destination,
  revision,
  mode,
  gatewayKey,
  mapsKey,
  request = fetch,
}: Options): Promise<JourneyRoutes> {
  const located = party.members.filter((member) => member.location).slice(0, 10);
  const cacheKey = JSON.stringify([
    party.code,
    mode,
    destination,
    located.map((member) => [member.id, member.location?.lat, member.location?.lng]),
  ]);
  for (const [key, entry] of cache) if (entry.expires <= Date.now()) cache.delete(key);
  const existing = cache.get(cacheKey);
  if (existing) return { ...(await existing.result), revision };
  if (cache.size >= 100) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  const run = async (): Promise<Omit<JourneyRoutes, "revision">> => {
    const routes: JourneyRoutes["routes"] = [];
    let unavailable = 0;
    const waypoint = (point: MapPoint) => ({
      location: { latLng: { latitude: point.lat, longitude: point.lng } },
    });
    // Two calls in flight, at most ten total. No provider polling or automatic retries.
    for (let index = 0; index < located.length; index += 2) {
      await Promise.all(
        located.slice(index, index + 2).map(async (member) => {
          const origin = member.location;
          if (!origin) return;
          let response: Response;
          try {
            response = await request(
              "https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes",
              {
                method: "POST",
                redirect: "manual",
                signal: AbortSignal.timeout(8000),
                headers: {
                  Authorization: `Bearer ${gatewayKey}`,
                  "X-Connection-Api-Key": mapsKey,
                  "Content-Type": "application/json",
                  "X-Goog-FieldMask":
                    "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
                },
                body: JSON.stringify({
                  origin: waypoint(origin),
                  destination: waypoint(destination),
                  travelMode: mode,
                  polylineQuality: "OVERVIEW",
                }),
              },
            );
          } catch {
            unavailable++;
            return;
          }
          if (!response.ok) {
            const body = await response.text();
            // Avoid logging coordinates or provider response bodies containing them.
            if (response.status === 403) {
              if (body.includes("API_KEY_HTTP_REFERRER_BLOCKED"))
                throw new Error(
                  "Google Maps server key is referrer-restricted (403). Set its application restrictions to None or IP addresses in Google Cloud Console.",
                );
              if (body.includes("API_KEY_SERVICE_BLOCKED"))
                throw new Error(
                  "Google Maps server key does not allow Routes API (403). Add Routes API to its allowed APIs in Google Cloud Console.",
                );
            }
            throw new Error(`Google Maps routes unavailable [${response.status}]: ${body}`);
          }
          const parsed = googleRouteSchema.safeParse(await response.json());
          const route = parsed.success ? parsed.data.routes[0] : undefined;
          if (!route) {
            unavailable++;
            return;
          }
          routes.push({
            memberId: member.id,
            origin: { lat: origin.lat, lng: origin.lng },
            encodedPolyline: route.polyline.encodedPolyline,
            distanceMetres: route.distanceMeters,
            durationSeconds: route.duration,
          });
        }),
      );
    }
    return { destination, routes, unavailable };
  };
  const result = run();
  cache.set(cacheKey, { expires: Date.now() + 5 * 60_000, result });
  try {
    return { ...(await result), revision };
  } catch (error) {
    cache.delete(cacheKey);
    throw error;
  }
}
