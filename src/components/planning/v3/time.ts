import { Temporal } from "@js-temporal/polyfill";
import { PLANNING_TIME_ZONE } from "@/lib/planning/tz";

/** Inclusive horizon: today through today + 14 days (15 selectable dates). */
export const HORIZON_DAYS = 14;
/** A range or a list of chosen dates may cover at most 14 calendar days. */
export const MAX_SELECTED_DAYS = 14;
export const SLOT_MINUTES = 30;
/** 00:00 on the chosen day through 06:00 the next morning (labelled overnight spillover). */
export const SLOTS_PER_DAY = 48 + 12;

export const nowZoned = (now: number) =>
  Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(PLANNING_TIME_ZONE);
export const todayIn = (now: number) => nowZoned(now).toPlainDate().toString();

export function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    return Temporal.PlainDate.from(value, { overflow: "reject" }).toString() === value;
  } catch {
    return false;
  }
}
export const addDays = (date: string, days: number) =>
  Temporal.PlainDate.from(date).add({ days }).toString();
export const daysBetween = (start: string, end: string) =>
  Temporal.PlainDate.from(start).until(Temporal.PlainDate.from(end), { largestUnit: "days" }).days;

export function horizonDates(today: string) {
  return Array.from({ length: HORIZON_DAYS + 1 }, (_, index) => addDays(today, index));
}
export function expandRange(startDate: string, endDate: string) {
  const length = daysBetween(startDate, endDate) + 1;
  if (length < 1) return [];
  return Array.from({ length }, (_, index) => addDays(startDate, index));
}
export function inHorizon(date: string, today: string) {
  return isValidIsoDate(date) && date >= today && date <= addDays(today, HORIZON_DAYS);
}

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});
const longDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
});
const toUtcNoon = (date: string) => new Date(`${date}T12:00:00Z`);
export const formatDate = (date: string) => dateFormat.format(toUtcNoon(date));
export const formatLongDate = (date: string) => longDateFormat.format(toUtcNoon(date));
export const weekdayIndex = (date: string) => Temporal.PlainDate.from(date).dayOfWeek % 7;

export function formatClock(hour: number, minute: number) {
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export type Slot = {
  index: number;
  /** Civil date on which this wall time occurs (date or date + 1 for spillover). */
  civilDate: string;
  hour: number;
  minute: number;
  label: string;
  overnight: boolean;
  /** `skipped`: wall time does not exist (spring-forward). `repeated`: occurs twice (fall-back). */
  clock: "normal" | "skipped" | "repeated";
  /** UTC bounds. Null when skipped. Repeated slots conservatively span both occurrences. */
  startMs: number | null;
  endMs: number | null;
};

function zoned(date: string, minutesFromMidnight: number, disambiguation: "earlier" | "later") {
  const day = Temporal.PlainDate.from(date).add({ days: Math.floor(minutesFromMidnight / 1440) });
  const minutes = minutesFromMidnight % 1440;
  return Temporal.ZonedDateTime.from(
    {
      timeZone: PLANNING_TIME_ZONE,
      year: day.year,
      month: day.month,
      day: day.day,
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    },
    { disambiguation },
  );
}
function wallExists(date: string, minutesFromMidnight: number) {
  const value = zoned(date, minutesFromMidnight, "earlier");
  const expectedMinutes = minutesFromMidnight % 1440;
  return value.hour * 60 + value.minute === expectedMinutes;
}

/**
 * Builds the 30-minute grid for one candidate day in America/Montreal.
 * DST policy (explicit, never fabricated):
 * - Spring-forward wall times that do not exist are `skipped` and cannot be painted.
 * - Fall-back wall times that occur twice are `repeated`; painting one blocks BOTH
 *   occurrences, which can only make a member busier, never invent availability.
 */
export function daySlots(date: string): Slot[] {
  return Array.from({ length: SLOTS_PER_DAY }, (_, index) => {
    const minutes = index * SLOT_MINUTES;
    const civilDate = addDays(date, Math.floor(minutes / 1440));
    const hour = Math.floor((minutes % 1440) / 60);
    const minute = minutes % 60;
    const overnight = minutes >= 1440;
    const label = formatClock(hour, minute);
    if (!wallExists(date, minutes)) {
      return {
        index,
        civilDate,
        hour,
        minute,
        label,
        overnight,
        clock: "skipped",
        startMs: null,
        endMs: null,
      } satisfies Slot;
    }
    const startEarlier = zoned(date, minutes, "earlier").epochMilliseconds;
    const startLater = zoned(date, minutes, "later").epochMilliseconds;
    // The end is the next wall time; when that is skipped, "later" resolves past the gap.
    const endMs = zoned(date, minutes + SLOT_MINUTES, "later").epochMilliseconds;
    return {
      index,
      civilDate,
      hour,
      minute,
      label,
      overnight,
      clock: startEarlier === startLater ? "normal" : "repeated",
      startMs: startEarlier,
      endMs,
    } satisfies Slot;
  });
}

export type Interval = { startAt: string; endAt: string };

/** True when this instant's Montréal wall time occurs twice (fall-back hour). */
export function isAmbiguousInstant(at: number) {
  const local = Temporal.Instant.fromEpochMilliseconds(at)
    .toZonedDateTimeISO(PLANNING_TIME_ZONE)
    .toPlainDateTime();
  const earlier = local.toZonedDateTime(PLANNING_TIME_ZONE, { disambiguation: "earlier" });
  const later = local.toZonedDateTime(PLANNING_TIME_ZONE, { disambiguation: "later" });
  return earlier.epochMilliseconds !== later.epochMilliseconds;
}

/** Merge busy slots into sorted, non-overlapping UTC intervals (never one per slot). */
export function slotsToIntervals(slots: Slot[], busy: ReadonlySet<number>): Interval[] {
  const ranges = slots
    .filter((slot) => busy.has(slot.index) && slot.startMs !== null && slot.endMs !== null)
    .map((slot) => [slot.startMs as number, slot.endMs as number] as const)
    .sort((a, b) => a[0] - b[0]);
  // The server rejects endpoints on a repeated (fall-back) wall time, so widen such an
  // endpoint outward to the nearest unambiguous half hour. This only adds busy time.
  const widened = ranges.map(([start, end]) => {
    let from = start;
    let to = end;
    while (isAmbiguousInstant(from)) from -= SLOT_MINUTES * 60_000;
    while (isAmbiguousInstant(to)) to += SLOT_MINUTES * 60_000;
    return [from, to] as const;
  });
  const merged: [number, number][] = [];
  for (const [start, end] of widened) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged.map(([start, end]) => ({
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
  }));
}

/** Rehydrate saved intervals: a slot is busy when any saved interval overlaps it. */
export function intervalsToSlots(slots: Slot[], intervals: Interval[]): Set<number> {
  const ranges = intervals.map(
    (entry) => [Date.parse(entry.startAt), Date.parse(entry.endAt)] as const,
  );
  return new Set(
    slots
      .filter(
        (slot) =>
          slot.startMs !== null &&
          ranges.some(
            ([start, end]) => (slot.startMs as number) < end && (slot.endMs as number) > start,
          ),
      )
      .map((slot) => slot.index),
  );
}

/** Slots that have already started are not offered as availability. */
export const isPastSlot = (slot: Slot, now: number) => slot.endMs !== null && slot.endMs <= now;

export type TimeOption = { value: string; label: string; nextDay: boolean };

/**
 * Tonight choices as UTC instants, so 00:00–06:00 is always a next-day timestamp.
 * The server accepts a departure before midnight tonight and a home-by time after 6 AM
 * today and no later than 6 AM tomorrow; repeated fall-back wall times are left out.
 */
export function tonightOptions(now: number): { departures: TimeOption[]; returns: TimeOption[] } {
  const slots = daySlots(todayIn(now));
  const upcoming = slots.filter(
    (slot) => slot.clock === "normal" && (slot.startMs as number) >= now,
  );
  const option = (slot: Slot, at: number): TimeOption => ({
    value: new Date(at).toISOString(),
    label: slot.overnight ? `${slot.label} (next day)` : slot.label,
    nextDay: slot.overnight,
  });
  const afterSixToday = (slot: Slot) => slot.overnight || slot.hour * 60 + slot.minute > 6 * 60;
  const last = slots.at(-1);
  return {
    departures: upcoming
      .filter((slot) => !slot.overnight)
      .map((slot) => option(slot, slot.startMs as number)),
    returns: [
      ...upcoming.filter(afterSixToday).map((slot) => option(slot, slot.startMs as number)),
      ...(last?.endMs
        ? [
            {
              value: new Date(last.endMs).toISOString(),
              label: "6:00 AM (next day)",
              nextDay: true,
            },
          ]
        : []),
    ],
  };
}

export function formatInstant(at: string | number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PLANNING_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
}
