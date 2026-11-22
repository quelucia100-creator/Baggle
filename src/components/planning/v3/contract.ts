/**
 * Frontend view of the authoritative V3 contract owned by the backend
 * (`src/lib/planning-v3/**`, Codex) and the `party_plan` RPC (Lovable).
 * Types and enums are re-exported from the backend so the UI cannot drift from it;
 * only presentation labels and the UI's command shape live here.
 */
import {
  activities,
  hostConfigV3Schema,
  memberPreferencesV3Schema,
  modes,
  vibes,
  type HostConfigV3,
  type MemberPreferencesV3,
} from "@/lib/planning-v3/schema";
import type {
  LegacyPlanningState,
  PlanningStateV3,
  VersionedPlanningState,
} from "@/lib/planning-v3/state";
import type { PublicPlanV3 } from "@/lib/planning-v3/venue";

export { hostConfigV3Schema, memberPreferencesV3Schema };
export type {
  HostConfigV3,
  LegacyPlanningState,
  MemberPreferencesV3,
  PlanningStateV3,
  PublicPlanV3,
  VersionedPlanningState,
};

export const VIBES = vibes;
/** Likes may also include "surprise"; exclusions are the seven real activities. */
export const ACTIVITIES = [...activities, "surprise"] as const;
export const EXCLUDABLE_ACTIVITIES = activities;
export const TRAVEL_MODES = modes;
export const ALCOHOL_POLICIES = ["allow", "no_age_restricted", "alcohol_free_only"] as const;
/** UI cap on hard no's (the backend accepts up to all seven). */
export const MAX_EXCLUSIONS = 3;

/**
 * Accessibility tags the venue pipeline can actually verify (Google Places accessibility
 * options; the curated catalogue uses the same names). Anything else would always fail closed.
 */
export const ACCESSIBILITY_TAGS = [
  "wheelchair_accessible_entrance",
  "wheelchair_accessible_restroom",
  "wheelchair_accessible_seating",
  "wheelchair_accessible_parking",
] as const;
/**
 * Dietary tags. No venue source currently supplies verified dietary evidence, so any dietary
 * requirement excludes every option until the backend adds that data (see the UI warning).
 */
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
export type PlanWarning = PublicPlanV3["warnings"][number];

/** Commands as the V3 UI issues them; the route adds version and capability. */
export type PlanningCommandV3 =
  | { action: "configure"; config: HostConfigV3 }
  | { action: "save"; preferences: MemberPreferencesV3 }
  | { action: "lock" | "reopen" }
  | { action: "vote" | "host_reroll" | "finalize"; revision: number };

export function backendSupportsV3(state: unknown): state is PlanningStateV3 {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as { schemaVersion?: unknown }).schemaVersion === 3
  );
}
export const isPlanV3 = (plan: unknown): plan is PublicPlanV3 =>
  typeof plan === "object" && plan !== null && (plan as { version?: unknown }).version === 3;

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
  wheelchair_accessible_entrance: "Wheelchair-accessible entrance",
  wheelchair_accessible_restroom: "Wheelchair-accessible washroom",
  wheelchair_accessible_seating: "Wheelchair-accessible seating",
  wheelchair_accessible_parking: "Wheelchair-accessible parking",
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
export const WARNING_LABELS: Record<PlanWarning, string> = {
  booking_unknown: "Booking need unknown — check with the venue before you go.",
  availability_not_reserved: "Nothing is reserved — space isn't guaranteed.",
  cost_unknown: "Cost unknown — check with the venue.",
  forecast_unknown: "Forecast not available for this time.",
  routing_coverage_limited: "Travel checks had limited route coverage.",
  route_estimates: "Some travel times are estimates.",
  paths_may_be_incomplete: "Walking or cycling paths may be incomplete.",
};
export const NO_MATCH_ACTION_LABELS: Record<string, string> = {
  expand_dates: "Add more days or a wider date range",
  expand_area: "Choose a larger or more flexible area",
  shorten_duration: "Try a shorter duration",
  review_own_preferences: "Everyone can review their own private answers",
};
export const DIETARY_UNVERIFIED_NOTE =
  "No venue has verified dietary information yet, so choosing a dietary requirement currently rules out every food option.";
