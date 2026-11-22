import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { PlanningConfig, Venue } from "./types";

const placesUrl = "https://connector-gateway.lovable.dev/google_maps/places/v1/places:searchNearby";
const fields = ["id", "displayName", "location", "businessStatus", "priceLevel", "regularOpeningHours", "rating"];
const searchTypes: Record<PlanningConfig["category"], string[]> = {
  park: ["park"],
  cafe: ["cafe", "coffee_shop"],
  museum: ["museum"],
  restaurant: ["restaurant"],
  activity: ["bowling_alley", "movie_theater", "planetarium", "video_arcade"],
};
const prices = new Map([
  ["PRICE_LEVEL_FREE", 0], ["PRICE_LEVEL_INEXPENSIVE", 1], ["PRICE_LEVEL_MODERATE", 2],
  ["PRICE_LEVEL_EXPENSIVE", 3], ["PRICE_LEVEL_VERY_EXPENSIVE", 4],
]);

const placeSchema = z.object({
  id: z.string().trim().min(1),
  displayName: z.object({ text: z.string().trim().min(1) }),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  businessStatus: z.string().optional(),
  priceLevel: z.unknown(),
  regularOpeningHours: z.unknown(),
  rating: z.unknown(),
});
const responseSchema = z.object({ places: z.array(z.unknown()).default([]), error: z.unknown() });
const pointSchema = z.object({
  day: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});
const openingHoursSchema = z.object({ periods: z.array(z.object({ open: pointSchema, close: pointSchema.optional() })) });
const priceSchema = z.string();
const ratingSchema = z.number().min(1).max(5);

const minutesPerDay = 24 * 60;
const minutesPerWeek = 7 * minutesPerDay;

function clockTime(minutes: number) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function minuteOfWeek(point: z.infer<typeof pointSchema>) {
  return point.day * minutesPerDay + point.hour * 60 + point.minute;
}

function readHours(value: unknown): Venue["hours"] {
  const parsed = openingHoursSchema.safeParse(value);
  if (!parsed.success) return null;
  const { periods } = parsed.data;
  const hours: NonNullable<Venue["hours"]> = {};
  for (const { open, close } of periods) {
    const start = minuteOfWeek(open);
    if (!close && (start !== 0 || periods.length !== 1)) return null;
    const end = close ? minuteOfWeek(close) : minutesPerWeek;
    if (close && close.day === open.day && end <= start) return null;
    const closeMinute = end < start ? end + minutesPerWeek : end;

    // Split at midnight because Venue periods cannot span more than one night.
    for (let cursor = start; cursor < closeMinute;) {
      const day = Math.floor(cursor / minutesPerDay);
      const dayStart = day * minutesPerDay;
      const next = Math.min(closeMinute, dayStart + minutesPerDay);
      (hours[String(day % 7)] ??= []).push({ open: clockTime(cursor - dayStart), close: clockTime(next - dayStart) });
      cursor = next;
    }
  }
  return hours;
}

export async function fetchPlanningVenues({ area, category }: Pick<PlanningConfig, "area" | "category">): Promise<Venue[]> {
  const key = process.env["GOOGLE_MAPS_API_KEY"]?.trim();
  const gatewayToken = process.env["LOVABLE_API_KEY"];
  if (!key || !gatewayToken) return [];

  try {
    const response = await fetch(placesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gatewayToken}`,
        "X-Connection-Api-Key": key,
        "X-Goog-FieldMask": fields.map((field) => `places.${field}`).join(","),
      },
      body: JSON.stringify({
        includedTypes: searchTypes[category],
        maxResultCount: 20,
        locationRestriction: { circle: { center: { latitude: area.lat, longitude: area.lng }, radius: 5000 } },
      }),
      signal: AbortSignal.timeout(4000),
      redirect: "manual",
    });
    // A provider denial, quota response or outage should immediately use the fallback.
    if (!response.ok) {
      const body = await response.text();
      console.error(`Event venue search failed [${response.status}]: ${body}`);
      // Legacy planning retains its curated fallback when live search is unavailable.
      return [];
    }
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.error != null) return [];

    const venues = new Map<string, Venue>();
    for (const item of parsed.data.places) {
      const candidate = placeSchema.safeParse(item);
      if (!candidate.success) continue;
      const place = candidate.data;
      if (place.businessStatus && place.businessStatus !== "OPERATIONAL" && place.businessStatus !== "BUSINESS_STATUS_UNSPECIFIED") continue;
      if (venues.has(place.id)) continue;

      const name = place.displayName.text;
      const priceLevel = priceSchema.safeParse(place.priceLevel);
      const mapsQuery = new URLSearchParams({ api: "1", query: name, query_place_id: place.id });
      venues.set(place.id, {
        placeId: place.id,
        name,
        category,
        priceTier: priceLevel.success ? prices.get(priceLevel.data) ?? null : null,
        location: { lat: place.location.latitude, lng: place.location.longitude },
        hours: readHours(place.regularOpeningHours),
        outdoor: category === "park",
        season: null,
        rating: ratingSchema.safeParse(place.rating).data ?? null,
        mapsUrl: `https://www.google.com/maps/search/?${mapsQuery}`,
      });
    }
    return [...venues.values()];
  } catch {
    return [];
  }
}
