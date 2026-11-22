import "@tanstack/react-start/server-only";
import { z } from "zod";
import { localDay, shiftDate, wallTime } from "../planning/tz";
import type { Point } from "./schema";
import type { VenueCandidateV3 } from "./venue";

const types = {
  park: { activities: ["outdoors"], vibes: ["chill_cozy", "adventurous"], outdoor: true },
  cafe: { activities: ["food_cafes"], vibes: ["chill_cozy"], outdoor: false },
  restaurant: { activities: ["food_cafes"], vibes: ["social_lively"], outdoor: false },
  museum: { activities: ["arts_culture"], vibes: ["chill_cozy", "creative"], outdoor: false },
  bowling_alley: {
    activities: ["games", "sports"],
    vibes: ["competitive", "social_lively"],
    outdoor: false,
  },
  movie_theater: { activities: ["entertainment"], vibes: ["chill_cozy"], outdoor: false },
  night_club: { activities: ["nightlife"], vibes: ["social_lively"], outdoor: false },
} satisfies Record<string, Pick<VenueCandidateV3, "activities" | "vibes" | "outdoor">>;
const fields = [
  "id",
  "displayName",
  "formattedAddress",
  "googleMapsUri",
  "location",
  "primaryType",
  "businessStatus",
  "utcOffsetMinutes",
  "currentOpeningHours.periods",
  "accessibilityOptions",
  "rating",
  "attributions",
];
const endpoint = "https://connector-gateway.lovable.dev/google_maps/places/v1/places:searchNearby";
const entry = z.object({
  date: z.object({ year: z.number().int(), month: z.number().int(), day: z.number().int() }),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});
const placeSchema = z.object({
  id: z.string().min(1),
  displayName: z.object({ text: z.string().min(1) }),
  formattedAddress: z.string().min(1),
  googleMapsUri: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === "https:"),
  location: z.object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  }),
  primaryType: z.string(),
  businessStatus: z.literal("OPERATIONAL"),
  utcOffsetMinutes: z.number().int(),
  currentOpeningHours: z.object({ periods: z.array(z.object({ open: entry, close: entry })) }),
  accessibilityOptions: z
    .object({
      wheelchairAccessibleEntrance: z.boolean().optional(),
      wheelchairAccessibleRestroom: z.boolean().optional(),
      wheelchairAccessibleParking: z.boolean().optional(),
      wheelchairAccessibleSeating: z.boolean().optional(),
    })
    .optional(),
  rating: z.number().min(0).max(5).optional(),
  attributions: z
    .array(z.object({ provider: z.string().min(1), providerUri: z.string().url().optional() }))
    .optional(),
});

const pad = (number: number) => String(number).padStart(2, "0");
function civil(data: z.infer<typeof entry>) {
  return wallTime(
    `${data.date.year}-${pad(data.date.month)}-${pad(data.date.day)}`,
    `${pad(data.hour)}:${pad(data.minute)}`,
  );
}

export function normalizeGooglePlace(input: unknown, now: number): VenueCandidateV3 | null {
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) return null;
  const p = parsed.data;
  const classification = Object.hasOwn(types, p.primaryType)
    ? types[p.primaryType as keyof typeof types]
    : undefined;
  if (!classification) return null;
  const today = localDay(now).date;
  const from = wallTime(today, "00:00");
  const to = wallTime(shiftDate(today, 7), "00:00");
  const localOffset = (Date.parse(`${today}T12:00:00Z`) - wallTime(today, "12:00")) / 60_000;
  if (localOffset !== p.utcOffsetMinutes) return null;
  const opening = p.currentOpeningHours.periods.flatMap((period) => {
    try {
      const start = Math.max(from, civil(period.open));
      const end = Math.min(to, civil(period.close));
      return end > start ? [{ start, end }] : [];
    } catch {
      return [];
    }
  });
  const a = p.accessibilityOptions;
  return {
    ...classification,
    placeId: p.id,
    name: p.displayName.text,
    address: p.formattedAddress,
    mapsUrl: p.googleMapsUri,
    location: { lat: p.location.latitude, lng: p.location.longitude },
    opening,
    expiresAt: now + 10 * 60_000,
    source: "google_places",
    sourceTimestamp: new Date(now).toISOString(),
    attribution: [
      { name: "Google Maps", url: "https://maps.google.com" },
      ...(p.attributions ?? []).map((entry) => ({
        name: entry.provider,
        url: entry.providerUri?.startsWith("https://") ? entry.providerUri : null,
      })),
    ],
    cost: null,
    bookingRequired: "unknown",
    bookingUrl: null,
    under18Allowed: null,
    alcoholFree: null,
    accessibility: [
      ...(a?.wheelchairAccessibleEntrance === true ? ["wheelchair_accessible_entrance"] : []),
      ...(a?.wheelchairAccessibleRestroom === true ? ["wheelchair_accessible_restroom"] : []),
      ...(a?.wheelchairAccessibleParking === true ? ["wheelchair_accessible_parking"] : []),
      ...(a?.wheelchairAccessibleSeating === true ? ["wheelchair_accessible_seating"] : []),
    ],
    dietary: [],
    season: null,
    rating: p.rating ?? null,
  };
}

// Google content is request-scoped. The frozen-options store must never receive these records.
export async function discoverGooglePlaces(
  center: Point,
  key: string | undefined,
  now: number,
  request = fetch,
  gatewayToken = process.env["LOVABLE_API_KEY"],
) {
  if (!key || !gatewayToken) return [];
  try {
    const response = await request(endpoint, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(2200),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gatewayToken}`,
        "X-Connection-Api-Key": key,
        "X-Goog-FieldMask": fields.map((field) => `places.${field}`).join(","),
      },
      body: JSON.stringify({
        includedPrimaryTypes: Object.keys(types),
        maxResultCount: 12,
        locationRestriction: {
          circle: { center: { latitude: center.lat, longitude: center.lng }, radius: 3500 },
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Event discovery failed [${response.status}]: ${body}`);
      return [];
    }
    const parsed = z
      .object({ places: z.array(z.unknown()).max(20).default([]) })
      .safeParse(await response.json());
    return parsed.success
      ? parsed.data.places.flatMap((place) => {
          const venue = normalizeGooglePlace(place, now);
          return venue ? [venue] : [];
        })
      : [];
  } catch {
    return [];
  }
}
