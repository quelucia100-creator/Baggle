import { localDay, MINUTE_MS, shiftDate, wallTime } from "./tz";
import type { ForecastHour, PlanOption, Point, Snapshot, SolverMember, Venue } from "./types";

type Window = { id: string; start: number; end: number };
type Ranked = { plan: PlanOption; mean: number; rating: number };
const clamp = (n: number) => Math.min(1, Math.max(0, n));
export const budgetCost = (price: number | null, budget: number) => price === null ? 0 : clamp((price - budget) / 4);
export function haversineKm(a: Point, b: Point) {
  const radians = (n: number) => n * Math.PI / 180;
  const dlat = radians(b.lat - a.lat); const dlng = radians(b.lng - a.lng);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function travelCost(origin: Point, destination: Point, maximum: number) {
  return clamp((haversineKm(origin, destination) * 4 + 5 - maximum) / maximum);
}
function memberWindow(member: SolverMember, date: string): Window {
  return { id: member.id, start: wallTime(date, member.freeFrom),
    end: wallTime(date, member.freeTo, member.freeTo <= member.freeFrom ? 1 : 0) };
}
function overlap(windows: Window[]) {
  return { start: Math.max(...windows.map((w) => w.start)), end: Math.min(...windows.map((w) => w.end)) };
}
function findOutliers(windows: Window[], duration: number): string[] {
  const single = windows.filter((w) => {
    const other = overlap(windows.filter((x) => x.id !== w.id));
    return other.end - other.start >= duration;
  }).map((w) => w.id);
  if (single.length) return single;
  let best = { start: 0, end: 0 };
  for (let i = 0; i < windows.length; i++) for (let j = i + 1; j < windows.length; j++) {
    const a = windows[i]; const b = windows[j]; if (!a || !b) continue;
    const pair = overlap([a, b]); if (pair.end - pair.start > best.end - best.start) best = pair;
  }
  if (best.end <= best.start) return windows.map((w) => w.id);
  return windows.filter((w) => Math.min(w.end, best.end) - Math.max(w.start, best.start) < duration).map((w) => w.id);
}

// Merge daily periods, including previous-day overnight periods and adjacent intervals.
export function openForSlot(venue: Venue, start: number, end: number): boolean {
  if (venue.hours === null) return true;
  const first = localDay(start).date; const last = localDay(end - 1).date;
  const days = [shiftDate(first, -1), first, ...(last !== first ? [last] : [])];
  const periods: Array<{ start: number; end: number }> = [];
  for (const date of days) {
    const weekday = localDay(wallTime(date, "12:00")).weekday;
    for (const period of venue.hours[String(weekday)] ?? []) {
      try {
        periods.push({ start: wallTime(date, period.open), end: wallTime(date, period.close, period.close !== "24:00" && period.close <= period.open ? 1 : 0) });
      } catch { /* Invalid provider/DST hours do not establish that a venue is open. */ }
    }
  }
  periods.sort((a, b) => a.start - b.start);
  let covered = start;
  for (const period of periods) {
    if (period.end <= covered) continue;
    if (period.start > covered) return false;
    covered = period.end; if (covered >= end) return true;
  }
  return false;
}
export function weatherForSlot(venue: Venue, start: number, end: number, forecast: ForecastHour[]) {
  const hours = forecast.filter((h) => Date.parse(h.at) < end && Date.parse(h.at) + 60 * MINUTE_MS > start);
  let penalty = 0;
  for (const h of hours) if (venue.outdoor) {
    if (h.precipitation >= 50 || h.code >= 51) penalty = Math.max(penalty, 0.5);
    if (h.temperature < -10 || h.temperature > 32) penalty = Math.max(penalty, 0.4);
  }
  const worst = [...hours].sort((a, b) => b.precipitation - a.precipitation)[0];
  return { penalty, weather: worst ? { temperature: worst.temperature, precipitation: worst.precipitation, code: worst.code } : null };
}

// Constant so shared text never reflects any member's private budget, travel or availability.
export const NEUTRAL_COMPROMISE = "Review this option";
export function solvePlans(snapshot: Snapshot, venues: Venue[], forecast: ForecastHour[] = []): { options: PlanOption[]; outliers: string[]; reason: string | null } {
  const { config, members } = snapshot;
  const duration = config.durationMin * MINUTE_MS;
  const windows = members.map((m) => memberWindow(m, config.date)); const shared = overlap(windows);
  if (members.length < 2 || shared.end - shared.start < duration) return { options: [], outliers: findOutliers(windows, duration), reason: "no_overlap" };
  const ranked: Ranked[] = [];
  for (let start = Math.ceil(shared.start / (30 * MINUTE_MS)) * 30 * MINUTE_MS; start + duration <= shared.end; start += 30 * MINUTE_MS) {
    const end = start + duration; const month = localDay(start).month;
    for (const venue of venues) {
      if (venue.category !== config.category) continue;
      if (venue.season === "winter" && month >= 5 && month <= 10 || venue.season === "summer" && (month <= 4 || month >= 11)) continue;
      if (!openForSlot(venue, start, end)) continue;
      const satisfaction = members.map((m) => 1 - Math.max(budgetCost(venue.priceTier, m.budget), travelCost(m.origin ?? config.area, venue.location, m.maxTravelMin)));
      const weather = weatherForSlot(venue, start, end, forecast);
      ranked.push({ plan: { venue: { placeId: venue.placeId, name: venue.name, category: venue.category, priceTier: venue.priceTier, location: venue.location, mapsUrl: venue.mapsUrl, outdoor: venue.outdoor },
        startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), score: Math.min(...satisfaction) * (1 - weather.penalty), compromise: NEUTRAL_COMPROMISE, hoursUnknown: venue.hours === null, weather: weather.weather },
        mean: satisfaction.reduce((a, b) => a + b, 0) / satisfaction.length, rating: venue.rating ?? 0 });
    }
  }
  ranked.sort((a, b) => b.plan.score - a.plan.score || b.mean - a.mean || a.plan.startAt.localeCompare(b.plan.startAt) || b.rating - a.rating || a.plan.venue.placeId.localeCompare(b.plan.venue.placeId));
  return { options: ranked.slice(0, 20).map((r) => r.plan), outliers: [], reason: ranked.length ? null : "no_venue_or_slot" };
}