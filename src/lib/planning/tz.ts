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
/** Minutes since Montreal midnight, floored to 5 minutes. */
export function montrealNowMinutes() {
  const now = Temporal.Now.plainTimeISO(PLANNING_TIME_ZONE);
  return Math.floor((now.hour * 60 + now.minute) / 5) * 5;
}
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Display parts for a Montreal date, e.g. { short: "Sun", day: 23, long: "Sunday, November 23" }. */
export function dayParts(date: string) {
  const day = Temporal.PlainDate.from(date);
  const weekday = WEEKDAYS[day.dayOfWeek % 7] ?? "";
  return { short: weekday.slice(0, 3), day: day.day, long: `${weekday}, ${MONTHS[day.month - 1]} ${day.day}` };
}
