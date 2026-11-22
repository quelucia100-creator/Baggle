import { openingSchedule, scheduledHoursStatus } from "./solver-hours";
import { isSnow, weatherPenalty } from "./solver-weather";
import { ceilToHalfHour, monthOf, windowToInterval } from "./tz";
import {
  DURATION_MIN,
  MAX_PLAN_OPTIONS,
  MAX_TIER,
  TRAVEL_MIN,
  type Interval,
  type IsoDate,
  type LatLng,
  type MemberPrefs,
  type PlanOption,
  type PriceTier,
  type Season,
  type SlotWeather,
  type SolverInput,
  type SolverResult,
  type Venue,
} from "./types";

export { hoursStatus } from "./solver-hours";
export { weatherPenalty } from "./solver-weather";

const MINUTE_MS = 60_000;
const SCORE_PRECISION = 1e9;
const EARTH_RADIUS_KM = 6371;

export type RankedCandidate = {
  score: number;
  meanSatisfaction: number;
  startMs: number;
  rating: number | null;
  placeId: string;
  venueId: string;
};

type Candidate = RankedCandidate & Omit<PlanOption, "rank" | "startAt" | "endAt">;
type MemberWindow = { memberId: string; interval: Interval };

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function assertIntegerInRange(value: number, min: number, max: number, name: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
  }
}

export function validateSolverInput(input: SolverInput): void {
  monthOf(input.date);
  assertIntegerInRange(input.durationMin, DURATION_MIN.min, DURATION_MIN.max, "Duration");
  if (input.members.length === 0) throw new RangeError("At least one member is required");
  assertIntegerInRange(input.options.maxOptions, 1, Number.MAX_SAFE_INTEGER, "Option limit");
  if (input.options.notBefore !== null && !Number.isFinite(input.options.notBefore.getTime())) {
    throw new RangeError("Invalid earliest start");
  }

  for (const { budget, maxTravelMin } of input.members) {
    if (budget !== null) assertIntegerInRange(budget, 0, MAX_TIER, "Budget");
    if (maxTravelMin !== null) {
      assertIntegerInRange(maxTravelMin, TRAVEL_MIN.min, TRAVEL_MIN.max, "Travel limit");
    }
  }
  for (const { priceTier } of input.venues) {
    if (priceTier !== null) assertIntegerInRange(priceTier, 0, MAX_TIER, "Price tier");
  }
}

function memberWindows(date: IsoDate, members: readonly MemberPrefs[]): MemberWindow[] {
  return members.map(({ memberId, freeFrom, freeTo }) => ({
    memberId,
    interval: windowToInterval(date, freeFrom, freeTo),
  }));
}

function intersect(windows: readonly MemberWindow[]): Interval | null {
  if (windows.length === 0) return null;
  const startMs = Math.max(...windows.map(({ interval }) => interval.startMs));
  const endMs = Math.min(...windows.map(({ interval }) => interval.endMs));
  return endMs > startMs ? { startMs, endMs } : null;
}

export function computeOverlap(date: IsoDate, members: readonly MemberPrefs[]): Interval | null {
  return intersect(memberWindows(date, members));
}

function durationMs(interval: Interval): number {
  return interval.endMs - interval.startMs;
}

export function findOutliers(windows: readonly MemberWindow[], durationMin: number): string[] {
  const sorted = [...windows].sort((a, b) => compareText(a.memberId, b.memberId));
  const outliers = sorted.filter((_, index) => {
    const remaining = intersect(sorted.filter((_, otherIndex) => index !== otherIndex));
    return remaining !== null && durationMs(remaining) >= durationMin * MINUTE_MS;
  });
  if (outliers.length) return outliers.map(({ memberId }) => memberId);

  let largest: Interval | null = null;
  for (const [index, first] of sorted.entries()) {
    for (const second of sorted.slice(index + 1)) {
      const pair = intersect([first, second]);
      if (
        pair &&
        (!largest ||
          durationMs(pair) > durationMs(largest) ||
          (durationMs(pair) === durationMs(largest) && pair.startMs < largest.startMs))
      ) {
        largest = pair;
      }
    }
  }

  const pairwiseOverlap = largest;
  return sorted
    .filter(
      ({ interval }) =>
        pairwiseOverlap === null ||
        interval.endMs <= pairwiseOverlap.startMs ||
        interval.startMs >= pairwiseOverlap.endMs,
    )
    .map(({ memberId }) => memberId);
}

export function candidateStarts(
  overlap: Interval,
  durationMin: number,
  notBefore: Date | null,
): number[] {
  const earliest = Math.max(overlap.startMs, notBefore?.getTime() ?? overlap.startMs);
  const last = overlap.endMs - durationMin * MINUTE_MS;
  const starts: number[] = [];
  if (earliest > last) return starts;
  for (let start = ceilToHalfHour(earliest); start <= last; start += 30 * MINUTE_MS) {
    starts.push(start);
  }
  return starts;
}

export function isInSeason(season: Season | null, month: number): boolean {
  const summer = month >= 5 && month <= 10;
  return season === null || season === (summer ? "summer" : "winter");
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const radians = Math.PI / 180;
  const latitude = (b.lat - a.lat) * radians;
  const longitude = (b.lng - a.lng) * radians;
  const squaredHalfChord =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(longitude / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(clampCost(squaredHalfChord)));
}

export function travelMinutes(origin: LatLng, venue: LatLng): number {
  return haversineKm(origin, venue) * 4 + 5;
}

function clampCost(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function budgetCost(tier: PriceTier | null, budget: PriceTier | null): number {
  return tier === null || budget === null ? 0 : clampCost((tier - budget) / MAX_TIER);
}

export function travelCost(minutes: number, max: number | null): number {
  return max === null ? 0 : clampCost((minutes - max) / max);
}

function memberCosts(member: MemberPrefs, venue: Venue, areaCenter: LatLng) {
  const budget = budgetCost(venue.priceTier, member.budget);
  const travel =
    member.maxTravelMin === null
      ? 0
      : travelCost(travelMinutes(member.origin ?? areaCenter, venue.location), member.maxTravelMin);
  return { budget, travel, cost: Math.max(budget, travel) };
}

export function memberCost(member: MemberPrefs, venue: Venue, areaCenter: LatLng): number {
  return memberCosts(member, venue, areaCenter).cost;
}

function roundedScore(score: number): number {
  return Math.round(score * SCORE_PRECISION) / SCORE_PRECISION;
}

export function compareCandidates(a: RankedCandidate, b: RankedCandidate): number {
  const byRating = a.rating === b.rating ? 0 : (b.rating ?? -Infinity) - (a.rating ?? -Infinity);
  return (
    roundedScore(b.score) - roundedScore(a.score) ||
    b.meanSatisfaction - a.meanSatisfaction ||
    a.startMs - b.startMs ||
    byRating ||
    compareText(a.placeId, b.placeId) ||
    compareText(a.venueId, b.venueId)
  );
}

export function compromiseText({
  budgetStretched,
  travelStretched,
  venue,
  slot,
}: {
  budgetStretched: number;
  travelStretched: number;
  venue: Venue;
  slot: SlotWeather | null;
}): string {
  const notes: string[] = [];
  if (budgetStretched > 0) {
    notes.push(
      `Stretches the budget for ${budgetStretched} ${budgetStretched === 1 ? "person" : "people"}`,
    );
  }
  if (travelStretched > 0) {
    notes.push(`Longer trip for ${travelStretched} ${travelStretched === 1 ? "person" : "people"}`);
  }
  if (slot && venue.isOutdoor && slot.precipProb !== null && slot.precipProb >= 30) {
    const precipitation = isSnow(slot.code) ? "snow" : "rain";
    notes.push(`Outdoor — ${Math.round(slot.precipProb)}% chance of ${precipitation}`);
  } else if (slot && !venue.isOutdoor && isSnow(slot.code)) {
    notes.push("Indoor pick: snow expected");
  }
  return notes.length ? notes.join(" · ") : "Works for everyone";
}

function rankVenues(input: SolverInput, overlap: Interval, starts: readonly number[]): Candidate[] {
  const month = monthOf(input.date);
  const length = input.durationMin * MINUTE_MS;
  const candidates: Candidate[] = [];
  for (const venue of input.venues) {
    if (!isInSeason(venue.season, month)) continue;
    const hours = openingSchedule(venue.hours, overlap);
    const costs = input.members.map((member) => memberCosts(member, venue, input.areaCenter));
    const satisfaction = costs.map(({ cost }) => 1 - cost);
    const minSatisfaction = Math.min(...satisfaction);
    const meanSatisfaction =
      satisfaction.reduce((sum, value) => sum + value, 0) / satisfaction.length;
    const budgetStretched = costs.filter(({ budget }) => budget > 0).length;
    const travelStretched = costs.filter(({ travel }) => travel > 0).length;

    for (const startMs of starts) {
      const slot = { startMs, endMs: startMs + length };
      const hoursStatus = scheduledHoursStatus(hours, slot);
      if (hoursStatus === "closed") continue;
      const { penalty, slot: weather } = weatherPenalty(venue, input.weather, slot, input.options);
      candidates.push({
        score: roundedScore(minSatisfaction * (1 - penalty)),
        meanSatisfaction,
        startMs,
        rating: venue.rating,
        placeId: venue.placeId,
        venueId: venue.venueId,
        compromise: compromiseText({ budgetStretched, travelStretched, venue, slot: weather }),
        weather,
        hoursUnknown: hoursStatus === "unknown",
      });
    }
  }
  return candidates.sort(compareCandidates);
}

export function solve(input: SolverInput): SolverResult {
  validateSolverInput(input);
  const windows = memberWindows(input.date, input.members);
  const overlap = intersect(windows);
  const length = input.durationMin * MINUTE_MS;
  if (!overlap || durationMs(overlap) < length) {
    return {
      kind: "no_plan",
      reason: "no_time",
      outlierMemberIds: findOutliers(windows, input.durationMin),
    };
  }

  const starts = candidateStarts(overlap, input.durationMin, input.options.notBefore);
  if (!starts.length) return { kind: "no_plan", reason: "no_time", outlierMemberIds: [] };
  const candidates = rankVenues(input, overlap, starts);
  if (!candidates.length) return { kind: "no_plan", reason: "no_venue" };

  const seen = new Set<string>();
  const options: PlanOption[] = [];
  const limit = Math.min(input.options.maxOptions, MAX_PLAN_OPTIONS);
  for (const candidate of candidates) {
    if (input.options.distinctVenues && seen.has(candidate.venueId)) continue;
    seen.add(candidate.venueId);
    options.push({
      rank: options.length,
      venueId: candidate.venueId,
      startAt: new Date(candidate.startMs).toISOString(),
      endAt: new Date(candidate.startMs + length).toISOString(),
      score: candidate.score,
      compromise: candidate.compromise,
      weather: candidate.weather,
      hoursUnknown: candidate.hoursUnknown,
    });
    if (options.length === limit) break;
  }
  return { kind: "plan", options };
}
