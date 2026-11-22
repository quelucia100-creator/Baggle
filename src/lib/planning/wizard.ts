import { preferencesSchema, type PlanningConfig } from "./types";

// Pure helpers for the one-question-per-screen hangout wizard at /party/$code/plan?step=.
export const planSteps = ["budget", "time", "radius", "vibe"] as const;
export type PlanStep = (typeof planSteps)[number];

export const budgetOptions = [
  { value: 0, label: "Free", note: "No spending" },
  { value: 1, label: "$", note: "Cheap eats" },
  { value: 2, label: "$$", note: "A normal night out" },
  { value: 3, label: "$$$", note: "A bit fancy" },
  { value: 4, label: "$$$$", note: "Treat ourselves" },
] as const;

export const vibeOptions = [
  { value: "chill", label: "Chill outdoors", category: "park" },
  { value: "coffee", label: "Coffee & chat", category: "cafe" },
  { value: "food", label: "Getting food", category: "restaurant" },
  { value: "culture", label: "Arts & culture", category: "museum" },
  { value: "active", label: "Do something active", category: "activity" },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  category: PlanningConfig["category"];
}>;
export type Vibe = (typeof vibeOptions)[number]["value"];

export function vibeCategory(vibe: Vibe): PlanningConfig["category"] {
  return vibeOptions.find((option) => option.value === vibe)?.category ?? "park";
}
export function isVibe(value: unknown): value is Vibe {
  return vibeOptions.some((option) => option.value === value);
}

/** The time slider covers now → now + 12 h in 30-minute steps (indices 0..24). */
export const STEP_MIN = 30;
export const TIME_STEPS = 24;
const DAY_MIN = 24 * 60;
const LATEST_START_MIN = DAY_MIN - 5;
export const MIN_KM = 1;
export const MAX_KM = 20;
const MIN_PER_KM = 4;
const BASE_TRAVEL_MIN = 5;

const pad = (n: number) => String(n).padStart(2, "0");
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function timeIndexToHHMM(nowMin: number, index: number): string {
  const minutes = (nowMin + index * STEP_MIN) % DAY_MIN;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Position of a saved HH:MM on today's slider, or null when it is outside the next 12 hours. */
export function hhmmToTimeIndex(nowMin: number, hhmm: string): number | null {
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (hours === undefined || minutes === undefined || Number.isNaN(hours) || Number.isNaN(minutes))
    return null;
  const diff = (hours * 60 + minutes - nowMin + DAY_MIN) % DAY_MIN;
  if (diff > TIME_STEPS * STEP_MIN) return null;
  return Math.round(diff / STEP_MIN);
}

/**
 * freeFrom is stored against the event date (today), so it must stay before midnight.
 * Only freeTo may roll into tomorrow (freeTo <= freeFrom means the next day to the solver).
 */
export function maxStartIndex(nowMin: number, gapSteps: number): number {
  const beforeMidnight = Math.floor((LATEST_START_MIN - nowMin) / STEP_MIN);
  return clamp(Math.min(beforeMidnight, TIME_STEPS - gapSteps), 0, TIME_STEPS);
}

export function minGapSteps(durationMin: number): number {
  return Math.max(1, Math.ceil(durationMin / STEP_MIN));
}

export function kmToTravelMin(km: number): number {
  return clamp(Math.round(km * MIN_PER_KM + BASE_TRAVEL_MIN), 5, 90);
}
export function travelMinToKm(minutes: number): number {
  return clamp(Math.round((minutes - BASE_TRAVEL_MIN) / MIN_PER_KM), MIN_KM, MAX_KM);
}

export type PlanDraft = {
  budget: number | null;
  freeFrom: string | null;
  freeTo: string | null;
  km: number | null;
  vibe: Vibe | null;
};
export const emptyPlanDraft: PlanDraft = {
  budget: null,
  freeFrom: null,
  freeTo: null,
  km: null,
  vibe: null,
};

export function isPlanStepComplete(step: PlanStep, draft: PlanDraft): boolean {
  switch (step) {
    case "budget":
      return draft.budget !== null;
    case "time":
      return draft.freeFrom !== null && draft.freeTo !== null;
    case "radius":
      return draft.km !== null;
    case "vibe":
      return draft.vibe !== null;
  }
}

export function firstIncompletePlanStep(draft: PlanDraft): PlanStep | null {
  return planSteps.find((step) => !isPlanStepComplete(step, draft)) ?? null;
}

const roundOrigin = (n: number) => Math.round(n * 100) / 100;

/** Builds the private `save` payload. Origins are rounded to ~1 km before leaving the browser. */
export function draftToPreferences(draft: PlanDraft, origin: { lat: number; lng: number } | null) {
  return preferencesSchema.parse({
    budget: draft.budget,
    freeFrom: draft.freeFrom,
    freeTo: draft.freeTo,
    maxTravelMin: draft.km === null ? null : kmToTravelMin(draft.km),
    originLat: origin ? roundOrigin(origin.lat) : null,
    originLng: origin ? roundOrigin(origin.lng) : null,
  });
}

/** "Now", "7:30 PM" or "1:00 AM (tomorrow)" for a slider position. */
export function timeIndexLabel(nowMin: number, index: number): string {
  if (index === 0) return "Now";
  const total = nowMin + index * STEP_MIN;
  const minutes = total % DAY_MIN;
  const hours = Math.floor(minutes / 60);
  const label = `${hours % 12 || 12}:${pad(minutes % 60)} ${hours < 12 ? "AM" : "PM"}`;
  return total >= DAY_MIN ? `${label} (tomorrow)` : label;
}
