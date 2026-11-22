import { preferencesSchema, type DayWindows, type PlanningConfig } from "./types";

// Pure helpers for the one-question-per-screen hangout wizard at /party/$code/plan?step=.
// The host picks the day first so the time step can show those days.
export const planSteps = ["day", "time", "budget", "radius", "vibe"] as const;
export type PlanStep = (typeof planSteps)[number];

/** Only the host chooses the day; guests answer for whatever day the host set. */
export function planStepsFor(isHost: boolean): readonly PlanStep[] {
  return isHost ? planSteps : ["budget", "time", "radius", "vibe"];
}

/* ---------- Budget: a dollar slider stored as the backend's 0-4 price level ---------- */

export const SPEND_MAX = 100;
export const SPEND_STEP = 5;
// Upper dollar bound (per person) for price levels 0..3; anything above is level 4.
const LEVEL_CEILINGS = [0, 15, 35, 70] as const;
// Where a previously saved level lands on the slider.
const LEVEL_SPEND = [0, 15, 30, 60, SPEND_MAX] as const;

export function spendToBudgetLevel(spend: number): number {
  const level = LEVEL_CEILINGS.findIndex((ceiling) => spend <= ceiling);
  return level === -1 ? 4 : level;
}
export function budgetLevelToSpend(level: number): number {
  return LEVEL_SPEND[Math.min(4, Math.max(0, Math.round(level)))] ?? LEVEL_SPEND[2];
}
export function spendLabel(spend: number): string {
  if (spend <= 0) return "$0";
  return spend >= SPEND_MAX ? `$${SPEND_MAX}+` : `$${spend}`;
}
export function spendNote(spend: number): string {
  return ["Free stuff only", "Cheap eats", "A normal night out", "A bit fancy", "Treat ourselves"][
    spendToBudgetLevel(spend)
  ] ?? "A normal night out";
}

/* ---------- Vibe ---------- */

export const vibeOptions = [
  { value: "sporty", label: "Sporty", emoji: "🏀", category: "activity" },
  { value: "competitive", label: "Competitive", emoji: "🏆", category: "activity" },
  { value: "chill", label: "Chill", emoji: "😌", category: "park" },
  { value: "eats", label: "Getting eats", emoji: "🍜", category: "restaurant" },
  { value: "creative", label: "Creative", emoji: "🎨", category: "museum" },
  { value: "surprise", label: "Surprise", emoji: "🎲", category: null },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  emoji: string;
  category: PlanningConfig["category"] | null;
}>;
export type Vibe = (typeof vibeOptions)[number]["value"];
const allCategories: PlanningConfig["category"][] = [
  "park",
  "cafe",
  "museum",
  "restaurant",
  "activity",
];

/** Surprise rolls a random place type each time the host searches. */
export function vibeCategory(vibe: Vibe, random = Math.random): PlanningConfig["category"] {
  const fixed = vibeOptions.find((option) => option.value === vibe)?.category;
  if (fixed) return fixed;
  return allCategories[Math.floor(random() * allCategories.length)] ?? "park";
}
export function isVibe(value: unknown): value is Vibe {
  return vibeOptions.some((option) => option.value === value);
}

/* ---------- Day + time ---------- */

/** "today", or a Montreal date (YYYY-MM-DD) the host picked. */
export type PlanDay = "today" | string;
export const STEP_MIN = 30;
export const TIME_STEPS = 24; // today: now -> now + 12 h
const DAY_START_MIN = 8 * 60; // another day: 8:00 AM ...
const DAY_STEPS = 36; // ... -> 2:00 AM the next morning
const DAY_MIN = 24 * 60;
const LATEST_START_MIN = DAY_MIN - 5;
export const PICKABLE_DAYS = 7;

export type TimeWindow = { baseMin: number; steps: number; isToday: boolean };
export function timeWindow(day: PlanDay, nowMin: number): TimeWindow {
  return day === "today"
    ? { baseMin: nowMin, steps: TIME_STEPS, isToday: true }
    : { baseMin: DAY_START_MIN, steps: DAY_STEPS, isToday: false };
}

const pad = (n: number) => String(n).padStart(2, "0");
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function timeIndexToHHMM(baseMin: number, index: number): string {
  const minutes = (baseMin + index * STEP_MIN) % DAY_MIN;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Position of a saved HH:MM on a slider, or null when it falls outside the window. */
export function hhmmToTimeIndex(
  baseMin: number,
  hhmm: string,
  steps: number = TIME_STEPS,
): number | null {
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (hours === undefined || minutes === undefined || Number.isNaN(hours) || Number.isNaN(minutes))
    return null;
  const diff = (hours * 60 + minutes - baseMin + DAY_MIN) % DAY_MIN;
  if (diff > steps * STEP_MIN) return null;
  return Math.round(diff / STEP_MIN);
}

/**
 * freeFrom is stored against the event date, so it must stay before midnight.
 * Only freeTo may roll into the next day (freeTo <= freeFrom means the next day to the solver).
 */
export function maxStartIndex(baseMin: number, gapSteps: number, steps: number = TIME_STEPS) {
  const beforeMidnight = Math.floor((LATEST_START_MIN - baseMin) / STEP_MIN);
  return clamp(Math.min(beforeMidnight, steps - gapSteps), 0, steps);
}

export function minGapSteps(durationMin: number): number {
  return Math.max(1, Math.ceil(durationMin / STEP_MIN));
}

/** "Now", "7:30 PM" or "1:00 AM (next day)" for a slider position. */
export function timeIndexLabel(baseMin: number, index: number, isToday = true): string {
  if (index === 0 && isToday) return "Now";
  const total = baseMin + index * STEP_MIN;
  const minutes = total % DAY_MIN;
  const hours = Math.floor(minutes / 60);
  const label = `${hours % 12 || 12}:${pad(minutes % 60)} ${hours < 12 ? "AM" : "PM"}`;
  if (total < DAY_MIN) return label;
  return `${label} (${isToday ? "tomorrow" : "next day"})`;
}

/** Scale under the time slider, e.g. Now +3h +6h ... or 8 AM 2 PM 8 PM 2 AM. */
export function timeMarks(window: TimeWindow): string[] {
  const every = window.isToday ? 6 : 12;
  return Array.from({ length: window.steps / every + 1 }, (_, i) =>
    window.isToday
      ? i === 0
        ? "Now"
        : `+${(i * every * STEP_MIN) / 60}h`
      : timeIndexLabel(window.baseMin, i * every, false)
          .replace(":00", "")
          .replace(" (next day)", ""),
  );
}

/* ---------- Travel: minutes, stored as the backend's maxTravelMin ---------- */

export const TRAVEL_MIN = 5;
export const TRAVEL_MAX = 90;
export const TRAVEL_STEP = 5;

/* ---------- Several days: paint the half-hours you're free on each day ---------- */

/** Half-hour cells from 12:00 AM to midnight. */
export const DAY_SLOTS = (24 * 60) / STEP_MIN;
/** Free half-hours on one day: sorted, unique cell indexes (0 = 12:00 AM, 47 = 11:30 PM). */
export type DayFree = readonly number[];
export type FreeWindow = { freeFrom: string; freeTo: string };

/** "12:00 AM", "7:30 PM" or "Midnight" for a cell edge (0..48). */
export function slotLabel(index: number): string {
  return index >= DAY_SLOTS ? "Midnight" : timeIndexLabel(0, index, false);
}

const validSlot = (index: number) => Number.isInteger(index) && index >= 0 && index < DAY_SLOTS;

/** Marks cells from..to (inclusive, either order) free or not free. */
export function paintSlots(free: DayFree, from: number, to: number, isFree: boolean): number[] {
  const [low, high] = from <= to ? [from, to] : [to, from];
  const next = new Set(free.filter(validSlot));
  for (let index = Math.max(0, low); index <= Math.min(DAY_SLOTS - 1, high); index++) {
    if (isFree) next.add(index);
    else next.delete(index);
  }
  return [...next].sort((a, b) => a - b);
}

/** Continuous free stretches as [from, to) cell ranges. */
export function freeRuns(free: DayFree): Array<{ from: number; to: number }> {
  const runs: Array<{ from: number; to: number }> = [];
  for (const index of [...new Set(free.filter(validSlot))].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && last.to === index) runs[runs.length - 1] = { ...last, to: index + 1 };
    else runs.push({ from: index, to: index + 1 });
  }
  return runs;
}

/** A free block on one day, as a [from, to) half-hour range. */
export type FreeBlock = { from: number; to: number };

/** Drops half-hours before `minSlot` (already past today). */
export function clampFree(free: DayFree, minSlot = 0): number[] {
  return free.filter((index) => validSlot(index) && index >= minSlot);
}

/** Replaces one block with another (or removes it when `next` is null). */
export function replaceBlock(
  free: DayFree,
  block: FreeBlock,
  next: FreeBlock | null,
  minSlot = 0,
): number[] {
  const without = paintSlots(free, block.from, block.to - 1, false);
  if (!next) return without;
  const from = Math.max(minSlot, Math.min(next.from, next.to - 1));
  const to = Math.min(DAY_SLOTS, Math.max(next.to, from + 1));
  return paintSlots(without, from, to - 1, true);
}

/** Where a moved block lands (keeping its length), or null when it no longer fits that day. */
export function movedStart(length: number, toStart: number, minSlot: number): number | null {
  const start = Math.min(DAY_SLOTS - length, Math.max(minSlot, toStart));
  return start < minSlot ? null : start;
}

/** Moves a block to a new start, on the same or another day, keeping its length. */
export function moveBlock(
  value: Readonly<Record<string, DayFree>>,
  fromDay: string,
  block: FreeBlock,
  toDay: string,
  toStart: number,
  minSlotFor: (date: string) => number = () => 0,
): Record<string, DayFree> {
  const length = block.to - block.from;
  const start = movedStart(length, toStart, minSlotFor(toDay));
  // Too long for what's left of that day: leave it where it was rather than cut it short.
  if (start === null) return value;
  const removed = {
    ...value,
    [fromDay]: paintSlots(value[fromDay] ?? [], block.from, block.to - 1, false),
  };
  return {
    ...removed,
    [toDay]: clampFree(
      paintSlots(removed[toDay] ?? [], start, start + length - 1, true),
      minSlotFor(toDay),
    ),
  };
}

/** Saved windows back onto the grid. A window ending at or before its start runs to midnight. */
export function windowsToSlots(windows: readonly FreeWindow[]): number[] {
  return windows.reduce<number[]>((free, window) => {
    const from = hhmmToTimeIndex(0, window.freeFrom, DAY_SLOTS);
    const to = hhmmToTimeIndex(0, window.freeTo, DAY_SLOTS);
    if (from === null || to === null) return free;
    const end = to <= from ? DAY_SLOTS : to;
    return end > from ? paintSlots(free, from, end - 1, true) : free;
  }, []);
}

/**
 * The windows to save: for each offered day, every free stretch long enough for the hangout.
 * A day with no such stretch doesn't work for this member and is left out.
 */
export function dayWindowsFor(
  dayFree: Readonly<Record<string, DayFree>>,
  days: readonly string[],
  minSteps = 1,
): DayWindows {
  return Object.fromEntries(
    days.flatMap((date) => {
      const windows = freeRuns(dayFree[date] ?? [])
        .filter((run) => run.to - run.from >= minSteps)
        .map((run): FreeWindow => ({
          freeFrom: timeIndexToHHMM(0, run.from),
          freeTo: timeIndexToHHMM(0, run.to),
        }));
      return windows.length ? [[date, windows]] : [];
    }),
  );
}

/* ---------- Draft ---------- */

export type PlanDraft = {
  spend: number | null;
  /** The event day: "today", or the earliest of pickedDays. */
  day: PlanDay | null;
  /** Every day the host tapped (sorted). Voting between them needs backend support. */
  pickedDays: string[];
  freeFrom: string | null;
  freeTo: string | null;
  travelMin: number | null;
  vibe: Vibe | null;
  /** Several days: the half-hours the member is free on each day, keyed by date. */
  dayFree: Record<string, DayFree>;
};
export const emptyPlanDraft: PlanDraft = {
  spend: null,
  day: null,
  pickedDays: [],
  freeFrom: null,
  freeTo: null,
  travelMin: null,
  vibe: null,
  dayFree: {},
};

export function isPlanStepComplete(step: PlanStep, draft: PlanDraft): boolean {
  switch (step) {
    case "budget":
      return draft.spend !== null;
    case "day":
      return draft.day !== null;
    case "time":
      return draft.freeFrom !== null && draft.freeTo !== null;
    case "radius":
      return draft.travelMin !== null;
    case "vibe":
      return draft.vibe !== null;
  }
}

export function firstIncompletePlanStep(
  draft: PlanDraft,
  steps: readonly PlanStep[] = planSteps,
): PlanStep | null {
  return steps.find((step) => !isPlanStepComplete(step, draft)) ?? null;
}

const roundOrigin = (n: number) => Math.round(n * 100) / 100;

/** Builds the private `save` payload. Origins are rounded to ~1 km before leaving the browser. */
export function draftToPreferences(draft: PlanDraft, origin: { lat: number; lng: number } | null) {
  return preferencesSchema.parse({
    budget: draft.spend === null ? null : spendToBudgetLevel(draft.spend),
    freeFrom: draft.freeFrom,
    freeTo: draft.freeTo,
    maxTravelMin: draft.travelMin,
    originLat: origin ? roundOrigin(origin.lat) : null,
    originLng: origin ? roundOrigin(origin.lng) : null,
  });
}

/** Adds or removes a day; the earliest picked day becomes the event day. */
export function togglePickedDay(picked: readonly string[], date: string): string[] {
  return picked.includes(date) ? picked.filter((day) => day !== date) : [...picked, date].sort();
}

/** The event date to configure: today, or the host's pick. */
export function planDayToDate(day: PlanDay, today: string): string {
  return day === "today" ? today : day;
}
/** Reads the shared config date back as a day choice (past dates count as today). */
export function dateToPlanDay(date: string, today: string): PlanDay {
  return date > today ? date : "today";
}
