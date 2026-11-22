import {
  memberPreferencesV3Schema,
  type Activity,
  type ExcludableActivity,
  type MemberPreferencesV3,
  type TravelMode,
  type Vibe,
} from "./contract";
import { daySlots, intervalsToSlots, isPastSlot, slotsToIntervals } from "./time";

export const BUDGET_STEP = 5;
export const BUDGET_MAX = 500;
export const BUDGET_PRESETS = [
  { id: "free", label: "Free", min: 0, max: 0 },
  { id: "under15", label: "Under $15", min: 0, max: 15 },
  { id: "15-30", label: "$15–30", min: 15, max: 30 },
  { id: "30-50", label: "$30–50", min: 30, max: 50 },
  { id: "50plus", label: "$50+", min: 50, max: BUDGET_MAX },
] as const;
export const TRAVEL_PRESETS = [10, 15, 30, 45, 60, 90];

export type DayDraft = { busy: number[]; confirmed: boolean };
export type OriginDraft =
  | { source: "current_location"; label: string; lat: number; lng: number }
  | { source: "manual"; label: string; lat: number; lng: number }
  | { source: "group_area"; label: string; lat: number; lng: number };

export type MemberDraft = {
  vibes: Vibe[];
  likedActivities: Activity[];
  excludedActivities: ExcludableActivity[];
  accessibility: string[];
  dietary: string[];
  note: string;
  preferredMinCad: number;
  preferredMaxCad: number;
  /** null until the member explicitly chooses a ceiling or "No hard limit". */
  ceiling: { kind: "cap"; cad: number } | { kind: "unlimited" } | null;
  departure: { kind: "anytime" } | { kind: "at"; at: string } | null;
  returnBy: { kind: "none" } | { kind: "at"; at: string } | null;
  days: Record<string, DayDraft>;
  origin: OriginDraft | null;
  travelMode: TravelMode | null;
  maxOneWayMinutes: number;
  returnMode: TravelMode | null;
  alreadyAtSharedMeetingPoint: boolean;
};

export const MEMBER_STEPS = [
  "vibe",
  "activities",
  "budget",
  "availability",
  "origin",
  "travel",
  "review",
] as const;
export type MemberStep = (typeof MEMBER_STEPS)[number];

export type MemberContext = {
  availabilityMode: "tonight" | "calendar";
  candidateDates: string[];
  sharedTravel: boolean;
  groupArea: { label: string; lat: number; lng: number } | null;
  freeOnly: boolean;
  now: number;
};

export function emptyMemberDraft(): MemberDraft {
  return {
    vibes: [],
    likedActivities: [],
    excludedActivities: [],
    accessibility: [],
    dietary: [],
    note: "",
    preferredMinCad: 0,
    preferredMaxCad: 30,
    ceiling: null,
    departure: null,
    returnBy: null,
    days: {},
    origin: null,
    travelMode: null,
    maxOneWayMinutes: 30,
    returnMode: null,
    alreadyAtSharedMeetingPoint: false,
  };
}

export function memberDraftFromV3(saved: MemberPreferencesV3): MemberDraft {
  const tonight = saved.availability.tonight;
  const days: Record<string, DayDraft> = {};
  for (const day of saved.availability.days) {
    days[day.date] = {
      confirmed: day.confirmed,
      busy: [...intervalsToSlots(daySlots(day.date), day.busyIntervals)].sort((a, b) => a - b),
    };
  }
  const { origin } = saved;
  return {
    vibes: [...saved.vibes],
    likedActivities: [...saved.likedActivities],
    excludedActivities: [...saved.excludedActivities],
    accessibility: [...saved.accessibilityHardRequirements],
    dietary: [...saved.dietaryHardRequirements],
    note: saved.optionalNote ?? "",
    preferredMinCad: saved.budget.preferredMinCad,
    preferredMaxCad: saved.budget.preferredMaxCad,
    ceiling: saved.budget.explicitlyUnlimited
      ? { kind: "unlimited" }
      : saved.budget.hardMaxCad === null
        ? null
        : { kind: "cap", cad: saved.budget.hardMaxCad },
    departure: !tonight
      ? null
      : tonight.anytimeFromNow
        ? { kind: "anytime" }
        : tonight.earliestDepartureAt
          ? { kind: "at", at: tonight.earliestDepartureAt }
          : null,
    returnBy: !tonight
      ? null
      : tonight.noReturnDeadline
        ? { kind: "none" }
        : tonight.latestReturnAt
          ? { kind: "at", at: tonight.latestReturnAt }
          : null,
    days,
    origin:
      origin.lat !== null && origin.lng !== null
        ? {
            source: origin.source,
            label: origin.label ?? "Saved starting point",
            lat: origin.lat,
            lng: origin.lng,
          }
        : null,
    travelMode: saved.travel.mode,
    maxOneWayMinutes: saved.travel.maxOneWayMinutes,
    returnMode: saved.travel.returnMode,
    alreadyAtSharedMeetingPoint: saved.travel.alreadyAtSharedMeetingPoint,
  };
}

const roundBudget = (value: number) =>
  Math.min(BUDGET_MAX, Math.max(0, Math.round(value / BUDGET_STEP) * BUDGET_STEP));
export const normalizeBudget = (value: number) => (Number.isFinite(value) ? roundBudget(value) : 0);

export function matchingPreset(draft: Pick<MemberDraft, "preferredMinCad" | "preferredMaxCad">) {
  return BUDGET_PRESETS.find(
    (preset) => preset.min === draft.preferredMinCad && preset.max === draft.preferredMaxCad,
  )?.id;
}

export function dayHasFreeTime(date: string, day: DayDraft | undefined, now: number) {
  if (!day?.confirmed) return false;
  const busy = new Set(day.busy);
  return daySlots(date).some(
    (slot) => slot.startMs !== null && !busy.has(slot.index) && !isPastSlot(slot, now),
  );
}

export function validateMemberStep(
  draft: MemberDraft,
  step: MemberStep,
  context: MemberContext,
): string | undefined {
  switch (step) {
    case "vibe":
      if (draft.vibes.length < 1) return "Choose at least one vibe.";
      if (draft.vibes.length > 2) return "Choose at most two vibes.";
      return undefined;
    case "activities":
      if (draft.excludedActivities.length > 3) return "Choose at most three hard no's.";
      if (draft.excludedActivities.some((entry) => draft.likedActivities.includes(entry)))
        return "An activity can't be both a like and a hard no.";
      if (draft.note.length > 280) return "Keep your note under 280 characters.";
      return undefined;
    case "budget":
      if (draft.preferredMinCad > draft.preferredMaxCad)
        return "Your preferred minimum can't be above your preferred maximum.";
      if (!draft.ceiling) return "Set a hard spending ceiling, or choose No hard limit.";
      if (draft.ceiling.kind === "cap" && draft.ceiling.cad < draft.preferredMaxCad)
        return "Your hard ceiling must be at least your preferred maximum.";
      return undefined;
    case "availability":
      if (context.availabilityMode === "tonight") {
        if (!draft.departure) return "Choose when you're free from, or Anytime.";
        if (!draft.returnBy) return "Choose when you need to be home, or No deadline.";
        const from = draft.departure.kind === "at" ? Date.parse(draft.departure.at) : context.now;
        if (draft.departure.kind === "at" && from + 30 * 60_000 <= context.now)
          return "That start time has passed. Choose a new time or Anytime.";
        if (draft.returnBy.kind === "at" && Date.parse(draft.returnBy.at) <= from)
          return "Your home-by time must be after the time you're free from.";
        return undefined;
      }
      {
        const unconfirmed = context.candidateDates.filter((date) => !draft.days[date]?.confirmed);
        if (unconfirmed.length)
          return `Confirm your schedule for every day (${unconfirmed.length} left).`;
        if (
          !context.candidateDates.some((date) =>
            dayHasFreeTime(date, draft.days[date], context.now),
          )
        )
          return "You're busy for every remaining slot. Free up at least one time window.";
      }
      return undefined;
    case "origin":
      if (!draft.origin) return "Choose a starting point.";
      if (draft.origin.source === "group_area" && !context.groupArea)
        return "The host hasn't set a group area. Choose another starting point.";
      return undefined;
    case "travel":
      if (!draft.travelMode) return "Choose how you'll travel.";
      if (
        !Number.isInteger(draft.maxOneWayMinutes) ||
        draft.maxOneWayMinutes < 5 ||
        draft.maxOneWayMinutes > 90
      )
        return "Choose a one-way travel limit from 5 to 90 minutes.";
      return undefined;
    case "review":
      for (const entry of MEMBER_STEPS.slice(0, -1)) {
        const error = validateMemberStep(draft, entry, context);
        if (error) return error;
      }
      return undefined;
  }
}

export function memberPayload(draft: MemberDraft, context: MemberContext): MemberPreferencesV3 {
  const error = validateMemberStep(draft, "review", context);
  if (error) throw new Error(error);
  const ceiling = draft.ceiling as NonNullable<MemberDraft["ceiling"]>;
  const origin = draft.origin as OriginDraft;
  const tonight = context.availabilityMode === "tonight";
  const departure = draft.departure;
  const returnBy = draft.returnBy;
  const payload: MemberPreferencesV3 = {
    version: 3,
    vibes: [...draft.vibes],
    likedActivities: [...draft.likedActivities],
    excludedActivities: [...draft.excludedActivities],
    budget: {
      currency: "CAD",
      preferredMinCad: draft.preferredMinCad,
      preferredMaxCad: draft.preferredMaxCad,
      hardMaxCad: ceiling.kind === "cap" ? ceiling.cad : null,
      explicitlyUnlimited: ceiling.kind === "unlimited",
    },
    availability: tonight
      ? {
          mode: "tonight",
          tonight: {
            earliestDepartureAt: departure?.kind === "at" ? departure.at : null,
            latestReturnAt: returnBy?.kind === "at" ? returnBy.at : null,
            anytimeFromNow: departure?.kind === "anytime",
            noReturnDeadline: returnBy?.kind === "none",
          },
          days: [],
        }
      : {
          mode: "calendar",
          tonight: null,
          days: context.candidateDates.map((date) => ({
            date,
            confirmed: true,
            busyIntervals: slotsToIntervals(daySlots(date), new Set(draft.days[date]?.busy ?? [])),
          })),
        },
    origin: {
      source: origin.source,
      label: origin.label,
      lat: origin.lat,
      lng: origin.lng,
      accuracy: "approximate",
    },
    travel: {
      mode: draft.travelMode as TravelMode,
      maxOneWayMinutes: draft.maxOneWayMinutes,
      returnMode: draft.returnMode,
      alreadyAtSharedMeetingPoint: context.sharedTravel && draft.alreadyAtSharedMeetingPoint,
    },
    accessibilityHardRequirements: [...draft.accessibility].sort(),
    dietaryHardRequirements: [...draft.dietary].sort(),
    optionalNote: draft.note.trim() ? draft.note.trim() : null,
  };
  return memberPreferencesV3Schema.parse(payload);
}

/** Rounds to ~1 km so a saved origin can't pinpoint a home. */
export const approximate = (value: number) => Math.round(value * 100) / 100;

/** Dining questions only matter when food can be suggested. */
export const diningPossible = (draft: Pick<MemberDraft, "excludedActivities">) =>
  !draft.excludedActivities.includes("food_cafes");
