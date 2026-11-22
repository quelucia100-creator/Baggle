/**
 * TEMPORARY frontend adapter for the canonical V3 contract in
 * docs/planning-v3/00_MASTER_SPEC.md.
 *
 * These schemas mirror the frozen field names exactly so the UI can be built and tested
 * before the authoritative server types land in `src/lib/planning/**` (Codex) and the
 * `party_plan` RPC (Lovable). They are NOT a second persistence API: nothing here talks to
 * a database. Once the backend publishes V3 types, replace these imports with the server
 * types and delete the duplicates.
 */
import { z } from "zod";
import type { PlanningState } from "@/lib/planning/types";

export const VIBES = [
  "chill_cozy",
  "social_lively",
  "adventurous",
  "competitive",
  "creative",
  "surprise_me",
] as const;
export const ACTIVITIES = [
  "food_cafes",
  "games",
  "sports",
  "outdoors",
  "arts_culture",
  "entertainment",
  "nightlife",
  "surprise",
] as const;
/** Every activity except "surprise", which can't meaningfully be excluded. */
export const EXCLUDABLE_ACTIVITIES = [
  "food_cafes",
  "games",
  "sports",
  "outdoors",
  "arts_culture",
  "entertainment",
  "nightlife",
] as const;
export const TRAVEL_MODES = ["walk", "transit", "drive", "bike"] as const;
export const ALCOHOL_POLICIES = ["allow", "no_age_restricted", "alcohol_free_only"] as const;
/** Tags the venue pipeline can verify. Free-text tags would never match verified evidence. */
export const ACCESSIBILITY_TAGS = [
  "step_free_entrance",
  "accessible_washroom",
  "elevator_access",
  "seating_available",
  "quiet_space",
] as const;
export const DIETARY_TAGS = [
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "gluten_free",
  "nut_allergy",
  "dairy_free",
] as const;

export type Vibe = (typeof VIBES)[number];
export type Activity = (typeof ACTIVITIES)[number];
export type ExcludableActivity = (typeof EXCLUDABLE_ACTIVITIES)[number];
export type TravelMode = (typeof TRAVEL_MODES)[number];
export type AlcoholPolicy = (typeof ALCOHOL_POLICIES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instant = z.string().datetime({ offset: true });
const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const travelMode = z.enum(TRAVEL_MODES);

export const hostConfigV3Schema = z
  .object({
    version: z.literal(3),
    dateSelection: z.object({
      mode: z.enum(["today_tonight", "future_dates", "best_day"]),
      selectionStyle: z.enum(["single", "multiple", "range"]).nullable(),
      candidateDates: z.array(isoDate).min(1).max(14),
      range: z.object({ startDate: isoDate, endDate: isoDate }).nullable(),
    }),
    duration: z.object({
      mode: z.enum(["fixed", "flexible"]),
      minMinutes: z.number().int().min(30).max(240).multipleOf(30),
      maxMinutes: z.number().int().min(30).max(240).multipleOf(30),
    }),
    area: z.object({
      mode: z.enum(["host_area", "optimize_for_group"]),
      label: z.string().trim().min(1).max(80).nullable(),
      point: point.nullable(),
      isStrict: z.boolean(),
    }),
    travelArrangement: z.object({
      mode: z.enum(["independent", "together"]),
      sharedMeetingPoint: point.extend({ label: z.string().trim().min(1).max(80) }).nullable(),
      sharedMode: travelMode.nullable(),
    }),
    rules: z.object({
      under18Friendly: z.boolean(),
      freeOnly: z.boolean(),
      alcoholPolicy: z.enum(ALCOHOL_POLICIES),
      requiredAccessibility: z.array(z.string()).max(ACCESSIBILITY_TAGS.length),
      dietaryHardRequirements: z.array(z.string()).max(DIETARY_TAGS.length),
    }),
  })
  .strict();
export type HostConfigV3 = z.infer<typeof hostConfigV3Schema>;

const busyInterval = z.object({ startAt: instant, endAt: instant });
export const memberPreferencesV3Schema = z
  .object({
    version: z.literal(3),
    vibes: z.array(z.enum(VIBES)).min(1).max(2),
    likedActivities: z.array(z.enum(ACTIVITIES)),
    excludedActivities: z.array(z.enum(EXCLUDABLE_ACTIVITIES)).max(3),
    budget: z.object({
      currency: z.literal("CAD"),
      preferredMinCad: z.number().int().min(0).max(500).multipleOf(5),
      preferredMaxCad: z.number().int().min(0).max(500).multipleOf(5),
      hardMaxCad: z.number().int().min(0).max(500).multipleOf(5).nullable(),
      explicitlyUnlimited: z.boolean(),
    }),
    availability: z.object({
      mode: z.enum(["tonight", "calendar"]),
      tonight: z
        .object({
          earliestDepartureAt: instant.nullable(),
          latestReturnAt: instant.nullable(),
          anytimeFromNow: z.boolean(),
          noReturnDeadline: z.boolean(),
        })
        .nullable(),
      days: z.array(
        z.object({ date: isoDate, confirmed: z.boolean(), busyIntervals: z.array(busyInterval) }),
      ),
    }),
    origin: z.object({
      source: z.enum(["current_location", "manual", "group_area"]),
      label: z.string().max(80).nullable(),
      lat: z.number().min(-90).max(90).nullable(),
      lng: z.number().min(-180).max(180).nullable(),
      accuracy: z.enum(["approximate", "precise_ephemeral"]),
    }),
    travel: z.object({
      mode: travelMode,
      maxOneWayMinutes: z.number().int().min(5).max(90),
      returnMode: travelMode.nullable(),
      alreadyAtSharedMeetingPoint: z.boolean(),
    }),
    accessibilityHardRequirements: z.array(z.string()),
    dietaryHardRequirements: z.array(z.string()),
    optionalNote: z.string().max(280).nullable(),
  })
  .strict();
export type MemberPreferencesV3 = z.infer<typeof memberPreferencesV3Schema>;

/**
 * Optional public V3 result metadata. Every field is optional because the current V2
 * backend returns only venue/startAt/endAt/weather/hoursUnknown. The UI renders a claim
 * only when the server supplies the evidence for it.
 */
export type PublicOptionV3Extras = {
  durationMinutes?: number;
  venue: {
    address?: string | null;
    sourceAttribution?: string | null;
  };
  cost?:
    | { kind: "free" }
    | { kind: "estimate"; minCad: number; maxCad: number; includesFood?: boolean | null }
    | { kind: "unknown" };
  hoursVerified?: boolean;
  bookingRequired?: "yes" | "no" | "unknown";
  bookingUrl?: string | null;
  accessibilityConfidence?: "verified" | "unknown" | null;
  travelEstimated?: boolean;
  warnings?: string[];
  reasons?: string[];
};

/** State shape the V3 RPC is expected to return (`schemaVersion: 3`). */
export type PlanningStateV3 = Omit<PlanningState, "config" | "selfPreferences"> & {
  schemaVersion: 3;
  config: HostConfigV3 | null;
  selfPreferences: MemberPreferencesV3 | null;
};

export type PlanningCommandV3 =
  | { action: "configure"; config: HostConfigV3 }
  | { action: "save"; preferences: MemberPreferencesV3 }
  | { action: "lock" | "finalize" | "reopen" }
  | { action: "vote" | "host_reroll"; revision: number };

/**
 * The V3 forms may only persist when the server explicitly advertises V3. The current V2
 * endpoint strips/rejects unknown fields, so sending V3 payloads there would silently lose
 * answers. Until then the UI keeps drafts locally and shows "requires backend update".
 */
export function backendSupportsV3(state: unknown): state is PlanningStateV3 {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as { schemaVersion?: unknown }).schemaVersion === 3
  );
}

export const VIBE_LABELS: Record<Vibe, string> = {
  chill_cozy: "Chill & cozy",
  social_lively: "Social & lively",
  adventurous: "Adventurous",
  competitive: "Competitive",
  creative: "Creative",
  surprise_me: "Surprise me",
};
export const ACTIVITY_LABELS: Record<Activity, string> = {
  food_cafes: "Food & cafés",
  games: "Games",
  sports: "Sports",
  outdoors: "Outdoors",
  arts_culture: "Arts & culture",
  entertainment: "Entertainment",
  nightlife: "Nightlife",
  surprise: "Surprise",
};
export const TRAVEL_LABELS: Record<TravelMode, string> = {
  walk: "Walk",
  transit: "Transit",
  drive: "Drive",
  bike: "Bike",
};
export const ACCESSIBILITY_LABELS: Record<(typeof ACCESSIBILITY_TAGS)[number], string> = {
  step_free_entrance: "Step-free entrance",
  accessible_washroom: "Accessible washroom",
  elevator_access: "Elevator to all used floors",
  seating_available: "Seating available",
  quiet_space: "Quiet space available",
};
export const DIETARY_LABELS: Record<(typeof DIETARY_TAGS)[number], string> = {
  vegetarian: "Vegetarian options",
  vegan: "Vegan options",
  halal: "Halal",
  kosher: "Kosher",
  gluten_free: "Gluten-free",
  nut_allergy: "Nut allergy safe",
  dairy_free: "Dairy-free",
};
export const ALCOHOL_LABELS: Record<AlcoholPolicy, { title: string; note: string }> = {
  allow: { title: "No alcohol rule", note: "Bars and restaurants that serve alcohol are fine." },
  no_age_restricted: {
    title: "No 18+ venues",
    note: "Skip venues that refuse entry to minors. Restaurants that serve alcohol can still work.",
  },
  alcohol_free_only: {
    title: "Alcohol-free venues only",
    note: "Stricter: skip anywhere that serves alcohol at all.",
  },
};
