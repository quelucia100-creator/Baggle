import { localDay, MINUTE_MS, shiftDate, wallTime } from "./tz";
import { NEUTRAL_COMPROMISE } from "./types";
import type { ForecastHour, PlanOption, Point, Snapshot, SolverMember, Venue } from "./types";

type Ranked = { plan: PlanOption; rating: number };
export function haversineKm(a: Point, b: Point) {
  const radians = (n: number) => (n * Math.PI) / 180;
  const dlat = radians(b.lat - a.lat);
  const dlng = radians(b.lng - a.lng);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
type Window = Pick<SolverMember, "freeFrom" | "freeTo">;
type SnapshotMember = Snapshot["members"][number];
function memberWindow(member: Window, date: string) {
  try {
    return {
      start: wallTime(date, member.freeFrom),
      end: wallTime(date, member.freeTo, member.freeTo <= member.freeFrom ? 1 : 0),
    };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    // Montreal DST gaps and ambiguous local times cannot establish availability.
    return null;
  }
}

// Merge daily periods, including previous-day overnight periods and adjacent intervals.
export function openForSlot(venue: Venue, start: number, end: number): boolean {
  if (venue.hours === null) return false;
  const first = localDay(start).date;
  const last = localDay(end - 1).date;
  const days = [shiftDate(first, -1), first, ...(last !== first ? [last] : [])];
  const periods: Array<{ start: number; end: number }> = [];
  for (const date of days) {
    const weekday = localDay(wallTime(date, "12:00")).weekday;
    for (const period of venue.hours[String(weekday)] ?? []) {
      try {
        periods.push({
          start: wallTime(date, period.open),
          end: wallTime(
            date,
            period.close,
            period.close !== "24:00" && period.close <= period.open ? 1 : 0,
          ),
        });
      } catch {
        /* Invalid provider/DST hours do not establish that a venue is open. */
      }
    }
  }
  periods.sort((a, b) => a.start - b.start);
  let covered = start;
  for (const period of periods) {
    if (period.end <= covered) continue;
    if (period.start > covered) return false;
    covered = period.end;
    if (covered >= end) return true;
  }
  return false;
}
export function weatherForSlot(venue: Venue, start: number, end: number, forecast: ForecastHour[]) {
  const hours = forecast.filter(
    (h) => Date.parse(h.at) < end && Date.parse(h.at) + 60 * MINUTE_MS > start,
  );
  let penalty = 0;
  for (const h of hours)
    if (venue.outdoor) {
      if (h.precipitation >= 50 || h.code >= 51) penalty = Math.max(penalty, 0.5);
      if (h.temperature < -10 || h.temperature > 32) penalty = Math.max(penalty, 0.4);
    }
  const worst = [...hours].sort((a, b) => b.precipitation - a.precipitation)[0];
  return {
    penalty,
    weather: worst
      ? { temperature: worst.temperature, precipitation: worst.precipitation, code: worst.code }
      : null,
  };
}

/** The host's candidate days, or the single event day. */
function candidateDates(config: Snapshot["config"]): string[] {
  return config.dates?.length ? [...new Set(config.dates)].sort() : [config.date];
}
type Interval = { start: number; end: number };
/**
 * A member's free stretches on one candidate day. Per-day answers win; a member without
 * them (single-day answer) is only available on the event day.
 */
function memberWindowsOn(member: SnapshotMember, date: string, eventDate: string): Interval[] {
  const windows = member.dayWindows
    ? (member.dayWindows[date] ?? [])
    : date === eventDate
      ? [member]
      : [];
  return windows.flatMap((window) => memberWindow(window, date) ?? []);
}
/** Merges overlapping or touching stretches so a slot can span them. */
function normalize(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  return sorted.reduce<Interval[]>((merged, next) => {
    const last = merged.at(-1);
    if (last && next.start <= last.end)
      return [...merged.slice(0, -1), { start: last.start, end: Math.max(last.end, next.end) }];
    return [...merged, next];
  }, []);
}
function intersect(a: Interval[], b: Interval[]): Interval[] {
  return a.flatMap((x) =>
    b.flatMap((y) => {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      return end > start ? [{ start, end }] : [];
    }),
  );
}
/** The stretches on one day when everyone is free (empty when someone can't make it). */
function sharedWindows(members: SnapshotMember[], date: string, eventDate: string): Interval[] {
  return (
    members.reduce<Interval[] | null>((shared, member) => {
      const own = normalize(memberWindowsOn(member, date, eventDate));
      return shared === null ? own : intersect(shared, own);
    }, null) ?? []
  );
}
const SLOT_MS = 30 * MINUTE_MS;
function slotStarts(window: { start: number; end: number }, duration: number): number[] {
  const starts: number[] = [];
  for (
    let start = Math.ceil(window.start / SLOT_MS) * SLOT_MS;
    start + duration <= window.end;
    start += SLOT_MS
  )
    starts.push(start);
  return starts;
}

export function solvePlans(
  snapshot: Snapshot,
  venues: Venue[],
  forecast: ForecastHour[] = [],
): { options: PlanOption[] } {
  const { config, members } = snapshot;
  const duration = config.durationMin * MINUTE_MS;
  if (members.length < 2) return { options: [] };
  const windows = candidateDates(config)
    .flatMap((date) => sharedWindows(members, date, config.date))
    .filter((window) => window.end - window.start >= duration);
  if (!windows.length) return { options: [] };

  const cheapestLimit = Math.min(...members.map((member) => member.budget));
  const feasibleVenues = venues.filter((venue) => {
    const price = venue.priceTier;
    return (
      venue.category === config.category &&
      venue.hours !== null &&
      price !== null &&
      Number.isInteger(price) &&
      price >= 0 &&
      price <= cheapestLimit &&
      members.every(
        (member) =>
          haversineKm(member.origin ?? config.area, venue.location) * 4 + 5 <= member.maxTravelMin,
      )
    );
  });
  const ranked: Ranked[] = [];
  for (const start of windows.flatMap((window) => slotStarts(window, duration))) {
    const end = start + duration;
    const month = localDay(start).month;
    for (const venue of feasibleVenues) {
      if (
        (venue.season === "winter" && month >= 5 && month <= 10) ||
        (venue.season === "summer" && (month <= 4 || month >= 11))
      )
        continue;
      if (!openForSlot(venue, start, end)) continue;
      const weather = weatherForSlot(venue, start, end, forecast);
      ranked.push({
        plan: {
          venue: {
            placeId: venue.placeId,
            name: venue.name,
            category: venue.category,
            priceTier: venue.priceTier,
            location: venue.location,
            mapsUrl: venue.mapsUrl,
            outdoor: venue.outdoor,
          },
          startAt: new Date(start).toISOString(),
          endAt: new Date(end).toISOString(),
          score: 1 - weather.penalty,
          compromise: NEUTRAL_COMPROMISE,
          hoursUnknown: false,
          weather: weather.weather,
        },
        rating: venue.rating ?? 0,
      });
    }
  }
  ranked.sort(
    (a, b) =>
      b.plan.score - a.plan.score ||
      a.plan.startAt.localeCompare(b.plan.startAt) ||
      b.rating - a.rating ||
      a.plan.venue.placeId.localeCompare(b.plan.venue.placeId),
  );
  return { options: ranked.slice(0, 20).map((r) => r.plan) };
}
