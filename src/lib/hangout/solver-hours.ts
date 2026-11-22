import { addDays, zonedParts, zonedToInstant } from "./tz";
import type { Interval, OpeningHours } from "./types";

type HoursStatus = "open" | "closed" | "unknown";
type OpeningSchedule = readonly Interval[] | null;

export function openingSchedule(hours: OpeningHours | null, range: Interval): OpeningSchedule {
  if (!hours?.periods.length) return null;

  const start = zonedParts(range.startMs);
  const lastDate = zonedParts(Math.max(range.startMs, range.endMs - 1)).date;
  const intervals: Interval[] = [];
  for (const { open, close } of hours.periods) {
    if (close === null) return [range];

    const daysSinceOpening = (start.weekday - open.day + 7) % 7;
    const daysUntilClose = (close.day - open.day + 7) % 7;
    const closesAfterMidnight =
      daysUntilClose === 0 && close.hour * 60 + close.minute < open.hour * 60 + open.minute;
    const closeOffset = closesAfterMidnight ? 1 : daysUntilClose;

    // Start with the previous occurrence, which might still be open at the range start.
    let openDate = addDays(start.date, -daysSinceOpening);
    while (openDate <= lastDate) {
      const startMs = zonedToInstant(openDate, open).getTime();
      const closeDate = addDays(openDate, closeOffset);
      const endMs = zonedToInstant(closeDate, close).getTime();
      if (endMs > startMs && endMs > range.startMs && startMs < range.endMs) {
        intervals.push({ startMs, endMs });
      }
      openDate = addDays(openDate, 7);
    }
  }

  const merged: Interval[] = [];
  for (const interval of intervals.sort((a, b) => a.startMs - b.startMs)) {
    const previous = merged.at(-1);
    if (previous && interval.startMs <= previous.endMs) {
      merged[merged.length - 1] = {
        startMs: previous.startMs,
        endMs: Math.max(previous.endMs, interval.endMs),
      };
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

export function scheduledHoursStatus(schedule: OpeningSchedule, slot: Interval): HoursStatus {
  if (schedule === null) return "unknown";
  return schedule.some(({ startMs, endMs }) => startMs <= slot.startMs && slot.endMs <= endMs)
    ? "open"
    : "closed";
}

export function hoursStatus(hours: OpeningHours | null, slot: Interval): HoursStatus {
  return scheduledHoursStatus(openingSchedule(hours, slot), slot);
}
