import type { Interval, IsoDate, WallTime } from "./types";

export const APP_TIME_ZONE = "America/Montreal";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const HALF_HOUR_MS = 30 * MINUTE_MS;
const formatters = new Map<string, Intl.DateTimeFormat>();

function dateMs(date: IsoDate): number {
  const midnight = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date.startsWith("0000") ||
    !Number.isFinite(midnight.getTime()) ||
    midnight.toISOString().slice(0, 10) !== date
  ) {
    throw new RangeError(`Invalid calendar date: ${date}`);
  }
  return midnight.getTime();
}

function minutesOfDay({ hour, minute }: WallTime): number {
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    throw new RangeError("Invalid wall time");
  }
  return hour * 60 + minute;
}

function readTime(value: string): { time: WallTime; extraMs: number } {
  const match = /^(\d{2}):(\d{2})(?::([0-5]\d)(?:\.(\d{1,6}))?)?$/.exec(value);
  if (!match) throw new RangeError(`Invalid wall time: ${value}`);
  const time = { hour: Number(match[1]), minute: Number(match[2]) };
  minutesOfDay(time);
  const fraction = (match[4] ?? "").padEnd(3, "0").slice(0, 3);
  return { time, extraMs: Number(match[3] ?? 0) * 1000 + Number(fraction) };
}

export function parseWallTime(value: string): WallTime {
  return readTime(value).time;
}

export function isCrossingMidnight(from: WallTime, to: WallTime): boolean {
  return minutesOfDay(to) <= minutesOfDay(from);
}

function localClock(instantMs: number, tz: string) {
  let formatter = formatters.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      calendar: "iso8601",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, formatter);
  }
  const parts = new Map(formatter.formatToParts(instantMs).map(({ type, value }) => [type, value]));
  const date = `${parts.get("year")?.padStart(4, "0")}-${parts.get("month")}-${parts.get("day")}`;
  return {
    date,
    hour: Number(parts.get("hour")),
    minute: Number(parts.get("minute")),
    second: Number(parts.get("second")),
    month: Number(parts.get("month")),
  };
}

function offsetAt(instantMs: number, tz: string): number {
  const clock = localClock(instantMs, tz);
  const localMs = dateMs(clock.date) + minutesOfDay(clock) * MINUTE_MS + clock.second * 1000;
  return localMs - Math.floor(instantMs / 1000) * 1000;
}

function resolveWallTime(wallMs: number, tz: string): number {
  // Sample both sides of the target day so both offsets are available at a clock change.
  const offsets = new Set([-DAY_MS, 0, DAY_MS].map((delta) => offsetAt(wallMs + delta, tz)));
  const candidates = [...offsets].map((offset) => wallMs - offset).sort((a, b) => a - b);
  const match = candidates.find((instant) => instant + offsetAt(instant, tz) === wallMs);
  // The first match is the earlier occurrence. A gap instead uses the pre-change offset.
  return match ?? Math.max(...candidates);
}

export function zonedToInstant(date: IsoDate, time: WallTime, tz = APP_TIME_ZONE): Date {
  return new Date(resolveWallTime(dateMs(date) + minutesOfDay(time) * MINUTE_MS, tz));
}

export function windowToInterval(
  date: IsoDate,
  from: string,
  to: string,
  tz = APP_TIME_ZONE,
): Interval {
  const start = readTime(from);
  const end = readTime(to);
  const fromMs = minutesOfDay(start.time) * MINUTE_MS + start.extraMs;
  const toMs = minutesOfDay(end.time) * MINUTE_MS + end.extraMs;
  const midnight = dateMs(date);
  return {
    startMs: resolveWallTime(midnight + fromMs, tz),
    endMs: resolveWallTime(midnight + toMs + (toMs <= fromMs ? DAY_MS : 0), tz),
  };
}

export function zonedParts(instant: Date | number, tz = APP_TIME_ZONE) {
  const { date, hour, minute, month } = localClock(Number(instant), tz);
  const weekday = new Date(dateMs(date)).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  return { date, weekday, hour, minute, month };
}

export function addDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isInteger(days)) throw new RangeError("Calendar days must be an integer");
  return new Date(dateMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function monthOf(date: IsoDate): number {
  return new Date(dateMs(date)).getUTCMonth() + 1;
}

export function ceilToHalfHour(instantMs: number, tz = APP_TIME_ZONE): number {
  const offset = offsetAt(instantMs, tz);
  const candidate = Math.ceil((instantMs + offset) / HALF_HOUR_MS) * HALF_HOUR_MS - offset;
  if (offset === offsetAt(candidate, tz)) return candidate;

  // Around a clock change, round through actual instants to keep repeated boundaries.
  for (let next = Math.ceil(instantMs / 1000) * 1000; ; next += 1000) {
    if ((next + offsetAt(next, tz)) % HALF_HOUR_MS === 0) return next;
  }
}
