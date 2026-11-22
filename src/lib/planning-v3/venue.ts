import { z } from "zod";
import type { ForecastHour } from "../planning/types";
import { MINUTE_MS, PLANNING_TIME_ZONE } from "../planning/tz";
import { activities, pointV3, vibes } from "./schema";
import type { Interval } from "./schema";

const text = z.string().trim().min(1).max(300);
const https = z
  .string()
  .max(1000)
  .url()
  .refine((value) => new URL(value).protocol === "https:");
const at = z.string().datetime();
const booking = z.enum(["yes", "no", "unknown"]);
const source = z.enum(["curated", "google_places"]);
const attribution = z
  .array(z.object({ name: text, url: https.nullable() }))
  .min(1)
  .max(20);
const cost = z
  .object({
    currency: z.literal("CAD"),
    minCad: z.number().finite().nonnegative(),
    maxCad: z.number().finite().nonnegative(),
    free: z.boolean(),
    confidence: z.literal("verified"),
    checkedAt: at,
    sourceUrl: https,
  })
  .refine((price) => price.minCad <= price.maxCad && price.free === (price.maxCad === 0));
const activity = z.enum(activities);
const weather = z.object({
  temperature: z.number().finite(),
  precipitation: z.number().min(0).max(100),
  code: z.number().int().nonnegative(),
});
export const warningsV3 = z
  .array(
    z.enum([
      "booking_unknown",
      "availability_not_reserved",
      "cost_unknown",
      "forecast_unknown",
      "routing_coverage_limited",
      "route_estimates",
      "paths_may_be_incomplete",
    ]),
  )
  .max(12);
export const publicVenueV3Schema = z.object({
  placeId: text,
  name: text,
  category: activity,
  // Kept as null for existing plan-card consumers. V3 costs are CAD amounts.
  priceTier: z.null(),
  location: pointV3.strip(),
  mapsUrl: https,
  outdoor: z.boolean(),
  address: text,
  source,
  sourceTimestamp: at,
  attribution,
  cost: cost.nullable(),
  bookingRequired: booking,
  bookingUrl: https.nullable(),
  accessibilityVerified: z.boolean(),
});

export const publicPlanV3Schema = z
  .object({
    version: z.literal(3),
    venue: publicVenueV3Schema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startAt: at,
    endAt: at,
    durationMinutes: z.number().int().min(30).max(240).multipleOf(30),
    timeZone: z.literal(PLANNING_TIME_ZONE),
    routeVerifiability: z.literal("provider_verified"),
    compromise: z.literal("Review this option"),
    hoursUnknown: z.literal(false),
    weather: weather.nullable(),
    warnings: warningsV3,
  })
  .refine(
    ({ startAt, endAt, durationMinutes, venue }) =>
      Date.parse(endAt) - Date.parse(startAt) === durationMinutes * MINUTE_MS &&
      (venue.bookingRequired === "yes" || venue.bookingUrl === null),
  );

export type PublicPlanV3 = z.infer<typeof publicPlanV3Schema>;
export type VenueCandidateV3 = Omit<
  PublicPlanV3["venue"],
  "category" | "priceTier" | "accessibilityVerified"
> & {
  activities: z.infer<typeof activity>[];
  vibes: (typeof vibes)[number][];
  opening: Interval[];
  requiredSlot?: Interval;
  expiresAt: number;
  under18Allowed: boolean | null;
  alcoholFree: boolean | null;
  accessibility: string[];
  dietary: string[];
  season: "winter" | "summer" | null;
  rating: number | null;
};

export function covers(open: Interval[], slot: Interval) {
  let cursor = slot.start;
  for (const period of [...open].sort((a, b) => a.start - b.start)) {
    if (period.end <= cursor) continue;
    if (period.start > cursor) return false;
    cursor = period.end;
    if (cursor >= slot.end) return true;
  }
  return false;
}

const HOUR = 60 * MINUTE_MS;
const unsafe = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99,
]);
const known = new Set([0, 1, 2, 3, 45, 48, ...unsafe]);
export function slotWeather(hours: ForecastHour[], slot: Interval) {
  const overlapping = hours.flatMap(({ at, ...value }) => {
    const start = Date.parse(at);
    const checked = weather.safeParse(value);
    return checked.success &&
      start % HOUR === 0 &&
      start < slot.end &&
      start + HOUR > slot.start &&
      known.has(value.code)
      ? [{ ...checked.data, start, end: start + HOUR }]
      : [];
  });
  const complete = covers(overlapping, slot);
  const danger = overlapping.some(
    (hour) =>
      hour.temperature < -5 ||
      hour.temperature > 32 ||
      unsafe.has(hour.code) ||
      hour.precipitation >= 50,
  );
  const worst = [...overlapping].sort((a, b) => b.precipitation - a.precipitation)[0];
  return { safe: complete && !danger, weather: complete && worst ? weather.parse(worst) : null };
}
