import { Temporal } from "@js-temporal/polyfill";

export const PLANNING_TIME_ZONE = "America/Montreal";
export const MINUTE_MS = 60_000;

// Reject nonexistent/ambiguous wall times rather than silently changing a member's availability.
export function wallTime(date: string, time: string, dayOffset = 0): number {
  const day = Temporal.PlainDate.from(date).add({ days: dayOffset + (time === "24:00" ? 1 : 0) });
  const clock = Temporal.PlainTime.from(time === "24:00" ? "00:00" : time);
  return Temporal.ZonedDateTime.from({ timeZone: PLANNING_TIME_ZONE, year: day.year, month: day.month,
    day: day.day, hour: clock.hour, minute: clock.minute }, { disambiguation: "reject" }).epochMilliseconds;
}

export function localDay(at: number) {
  const zoned = Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(PLANNING_TIME_ZONE);
  return { date: zoned.toPlainDate().toString(), weekday: zoned.dayOfWeek % 7, month: zoned.month };
}
export function shiftDate(date: string, days: number) { return Temporal.PlainDate.from(date).add({ days }).toString(); }
export function montrealToday() { return Temporal.Now.plainDateISO(PLANNING_TIME_ZONE).toString(); }