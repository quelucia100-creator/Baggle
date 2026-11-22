import { shiftDate, wallTime } from "@/lib/planning/tz";
import type { HostConfigV3, MemberPreferencesV3, SnapshotV3 } from "@/lib/planning-v3/schema";
import type { VenueCandidateV3 } from "@/lib/planning-v3/venue";

export const day = "2026-11-23";
export const now = wallTime(shiftDate(day, -1), "22:00");
export const clock = (time: string, offset = 0) => wallTime(day, time, offset);
export const iso = (at: number) => new Date(at).toISOString();
export const point = { lat: 45.51, lng: -73.57 };
export const destination = { lat: 45.52, lng: -73.58 };
export const hostConfig = (): HostConfigV3 => ({
  version: 3,
  dateSelection: {
    mode: "future_dates",
    selectionStyle: "single",
    candidateDates: [day],
    range: null,
  },
  duration: { mode: "fixed", minMinutes: 60, maxMinutes: 60 },
  area: { mode: "optimize_for_group", point: null, label: null, isStrict: false },
  travelArrangement: { mode: "independent", sharedMeetingPoint: null, sharedMode: null },
  rules: {
    under18Friendly: false,
    freeOnly: false,
    alcoholPolicy: "allow",
    requiredAccessibility: [],
    dietaryHardRequirements: [],
  },
});
export const prefs = (): MemberPreferencesV3 => ({
  version: 3,
  vibes: ["chill_cozy"],
  likedActivities: ["arts_culture"],
  excludedActivities: [],
  budget: {
    currency: "CAD",
    preferredMinCad: 10,
    preferredMaxCad: 20,
    hardMaxCad: 25,
    explicitlyUnlimited: false,
  },
  availability: {
    mode: "calendar",
    tonight: null,
    days: [{ date: day, confirmed: true, busyIntervals: [] }],
  },
  travel: {
    mode: "walk",
    maxOneWayMinutes: 30,
    returnMode: null,
    alreadyAtSharedMeetingPoint: false,
  },
  origin: { ...point, label: "Downtown", source: "manual", accuracy: "approximate" },
  accessibilityHardRequirements: [],
  dietaryHardRequirements: [],
  optionalNote: null,
});
export const memberIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
];
export const snapshot = (answers = [prefs(), prefs()], config = hostConfig()): SnapshotV3 => ({
  schemaVersion: 3,
  revision: 2,
  config,
  members: answers.map((preferences, i) => ({ id: memberIds[i]!, preferences })),
});
const site = "https://example.org";
export const venue = (): VenueCandidateV3 => ({
  placeId: "fixture:museum",
  name: "Museum",
  address: "42 Museum Street",
  location: destination,
  mapsUrl: site,
  activities: ["arts_culture"],
  vibes: ["chill_cozy"],
  outdoor: false,
  source: "curated",
  sourceTimestamp: iso(now),
  attribution: [{ name: "Fixture", url: site }],
  opening: [{ start: clock("19:00"), end: clock("20:00") }],
  expiresAt: clock("24:00"),
  cost: {
    currency: "CAD",
    minCad: 5,
    maxCad: 5,
    free: false,
    confidence: "verified",
    checkedAt: iso(now),
    sourceUrl: site,
  },
  under18Allowed: true,
  alcoholFree: false,
  accessibility: [],
  dietary: [],
  bookingRequired: "unknown",
  bookingUrl: null,
  season: null,
  rating: 4,
});
