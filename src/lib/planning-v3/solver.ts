import { haversineKm } from "../planning/solver";
import { MINUTE_MS, PLANNING_TIME_ZONE, localDay } from "../planning/tz";
import { availableWindows, dayBounds, unambiguous } from "./schema";
import type { HostConfigV3, Interval, MemberPreferencesV3, SnapshotV3 } from "./schema";
import { originFor, travelForSlot } from "./travel";
import type { RouteProvider } from "./travel";
import { covers, publicPlanV3Schema, slotWeather } from "./venue";
import type { PublicPlanV3, VenueCandidateV3 } from "./venue";
import type { ForecastHour } from "../planning/types";

const SLOT = 30 * MINUTE_MS;
const STRICT_AREA_KM = 3;
const SEARCH_AREA_KM = 35;
const TOP_VENUES = 12;
const MAX_OPTIONS = 20;

function constraints(v: VenueCandidateV3, config: HostConfigV3, members: MemberPreferencesV3[]) {
  const { area, rules } = config;
  if (
    !v.activities.length ||
    !v.opening.length ||
    (area.isStrict && area.point && haversineKm(v.location, area.point) > STRICT_AREA_KM) ||
    (rules.freeOnly && !v.cost?.free) ||
    ((rules.under18Friendly || rules.alcoholPolicy === "no_age_restricted") &&
      v.under18Allowed !== true) ||
    (rules.alcoholPolicy === "alcohol_free_only" && v.alcoholFree !== true)
  )
    return false;
  return members.every((p) => {
    const origin =
      p.travel.alreadyAtSharedMeetingPoint && config.travelArrangement.sharedMeetingPoint
        ? config.travelArrangement.sharedMeetingPoint
        : originFor(p, config);
    return (
      origin &&
      haversineKm(origin, v.location) <= SEARCH_AREA_KM &&
      (p.budget.hardMaxCad === null || (v.cost !== null && v.cost.maxCad <= p.budget.hardMaxCad)) &&
      !p.excludedActivities.some((tag) => v.activities.includes(tag)) &&
      [...rules.requiredAccessibility, ...p.accessibilityHardRequirements].every((tag) =>
        v.accessibility.includes(tag),
      ) &&
      [...rules.dietaryHardRequirements, ...p.dietaryHardRequirements].every((tag) =>
        v.dietary.includes(tag),
      )
    );
  });
}

function satisfaction(p: MemberPreferencesV3, v: VenueCandidateV3) {
  const hasVibe = p.vibes.some((tag) => tag === "surprise_me" || v.vibes.includes(tag));
  const hasActivity =
    !p.likedActivities.length ||
    p.likedActivities.some((tag) => tag === "surprise" || v.activities.includes(tag));
  const spending = v.cost
    ? Math.max(
        0,
        1 -
          Math.max(
            0,
            v.cost.maxCad - p.budget.preferredMaxCad,
            p.budget.preferredMinCad - v.cost.maxCad,
          ) /
            500,
      )
    : 0.5;
  return (Number(hasVibe) * 2 + Number(hasActivity) * 2 + spending) / 5;
}

type Candidate = {
  date: string;
  slot: Interval;
  venue: VenueCandidateV3;
  dayMembers: { preferences: MemberPreferencesV3; windows: Interval[] }[];
  min: number;
  mean: number;
  areaKm: number;
  weather: PublicPlanV3["weather"];
};

export async function solveV3(
  snapshot: SnapshotV3,
  venues: VenueCandidateV3[],
  routes: RouteProvider,
  forecasts: ReadonlyMap<string, ForecastHour[]>,
  now: number,
): Promise<PublicPlanV3[]> {
  if (snapshot.members.length < 2) return [];
  const { config } = snapshot;
  const members = snapshot.members.map((m) => m.preferences);
  const eligible = venues
    .filter((v) => v.expiresAt > now && constraints(v, config, members))
    .map((venue) => {
      const scores = members.map((p) => satisfaction(p, venue));
      return {
        venue,
        min: Math.min(...scores),
        mean: scores.reduce((a, b) => a + b, 0) / scores.length,
        areaKm: config.area.point ? haversineKm(config.area.point, venue.location) : 0,
      };
    })
    .sort(
      (a, b) =>
        b.min - a.min ||
        b.mean - a.mean ||
        a.areaKm - b.areaKm ||
        a.venue.placeId.localeCompare(b.venue.placeId),
    )
    .slice(0, TOP_VENUES);

  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const date of config.dateSelection.candidateDates) {
    const bounds = dayBounds(date);
    if (bounds.end <= now) continue;
    const dayMembers = members.map((preferences) => ({
      preferences,
      windows: availableWindows(preferences, date, now),
    }));
    if (dayMembers.some((member) => member.windows.length === 0)) continue;
    const first = Math.max(
      bounds.start,
      now,
      ...dayMembers.map((member) => member.windows[0]?.start ?? Infinity),
    );
    for (let start = Math.ceil(first / SLOT) * SLOT; start < bounds.end; start += SLOT) {
      if (!unambiguous(start, true)) continue;
      for (
        let duration = config.duration.minMinutes;
        duration <= config.duration.maxMinutes;
        duration += 30
      ) {
        const end = start + duration * MINUTE_MS;
        if (
          end > bounds.end ||
          !unambiguous(end, true) ||
          !dayMembers.every((member) =>
            member.windows.some((window) => start >= window.start && end <= window.end),
          )
        )
          continue;
        const slot = { start, end };
        const winter = [1, 2, 3, 4, 11, 12].includes(localDay(start).month);
        for (const ranked of eligible) {
          const { venue } = ranked;
          if (
            (venue.season === "winter" && !winter) ||
            (venue.season === "summer" && winter) ||
            (venue.requiredSlot &&
              (venue.requiredSlot.start !== slot.start || venue.requiredSlot.end !== slot.end)) ||
            !covers(venue.opening, slot)
          )
            continue;
          const conditions = slotWeather(forecasts.get(venue.placeId) ?? [], slot);
          if (venue.outdoor && !conditions.safe) continue;
          candidates.push({ ...ranked, date, slot, dayMembers, weather: conditions.weather });
        }
      }
    }
  }
  // Interleave search days for each preference band before spending the bounded provider quota.
  const dayOrder = new Map<string, number>();
  candidates.sort((a, b) => a.slot.start - b.slot.start || a.slot.end - b.slot.end);
  const queue = candidates
    .map((candidate) => {
      const key = [candidate.min, candidate.mean, candidate.date].join();
      const index = dayOrder.get(key) ?? 0;
      dayOrder.set(key, index + 1);
      return { candidate, index };
    })
    .sort(
      (a, b) =>
        b.candidate.min - a.candidate.min ||
        b.candidate.mean - a.candidate.mean ||
        a.index - b.index ||
        a.candidate.slot.start - b.candidate.slot.start,
    );

  const verified: { candidate: Candidate; burden: number; spread: number }[] = [];
  for (let start = 0; start < queue.length; start += 20) {
    const batch = await Promise.all(
      queue.slice(start, start + 20).map(async ({ candidate }) => {
        const available = candidate.dayMembers.map((member) => ({
          ...member,
          windows: member.windows.filter(
            (window) => window.start <= candidate.slot.start && window.end >= candidate.slot.end,
          ),
        }));
        const travel = await travelForSlot(
          routes,
          config,
          available,
          candidate.venue.location,
          candidate.slot,
        );
        return travel
          ? {
              candidate,
              burden: Math.max(...travel),
              spread: Math.max(...travel) - Math.min(...travel),
            }
          : null;
      }),
    );
    for (const option of batch) if (option) verified.push(option);
    // The adapter can still resolve memoized routes after a quota cap.
  }

  const selected: PublicPlanV3[] = [];
  const usage = new Map<string, number>();
  const count = (id: string) => usage.get(id) ?? 0;
  const variety = (candidate: Candidate) =>
    count(candidate.venue.placeId) * 2 + count(candidate.venue.activities[0]!);
  while (verified.length && selected.length < MAX_OPTIONS) {
    verified.sort((a, b) => {
      const left = a.candidate;
      const right = b.candidate;
      return (
        right.min - left.min ||
        right.mean - left.mean ||
        a.burden - b.burden ||
        a.spread - b.spread ||
        variety(left) - variety(right) ||
        left.areaKm - right.areaKm ||
        Number(!!right.weather) - Number(!!left.weather) ||
        (left.weather?.precipitation ?? 0) - (right.weather?.precipitation ?? 0) ||
        Number(right.venue.source === "curated") - Number(left.venue.source === "curated") ||
        (right.venue.rating ?? 0) - (left.venue.rating ?? 0) ||
        left.venue.placeId.localeCompare(right.venue.placeId) ||
        left.slot.start - right.slot.start ||
        left.slot.end - right.slot.end
      );
    });
    const {
      candidate: { venue, slot, weather },
    } = verified.shift()!;
    const key = [venue.placeId, slot.start, slot.end].join();
    if (seen.has(key)) continue;
    const plan = publicPlanV3Schema.safeParse({
      version: 3,
      date: localDay(slot.start).date,
      venue: {
        ...venue,
        category: venue.activities[0]!,
        priceTier: null,
        bookingUrl: venue.bookingRequired === "yes" ? venue.bookingUrl : null,
        accessibilityVerified: venue.accessibility.length > 0,
      },
      startAt: new Date(slot.start).toISOString(),
      endAt: new Date(slot.end).toISOString(),
      durationMinutes: (slot.end - slot.start) / MINUTE_MS,
      timeZone: PLANNING_TIME_ZONE,
      routeVerifiability: "provider_verified",
      compromise: "Review this option",
      hoursUnknown: false,
      weather,
      warnings: [
        "route_estimates",
        "paths_may_be_incomplete",
        ...(venue.bookingRequired === "unknown" ? ["booking_unknown"] : []),
        ...(venue.bookingRequired !== "no" ? ["availability_not_reserved"] : []),
        ...(venue.cost ? [] : ["cost_unknown"]),
        ...(weather ? [] : ["forecast_unknown"]),
        ...(routes.limited ? ["routing_coverage_limited"] : []),
      ],
    });
    if (!plan.success) continue;
    seen.add(key);
    usage.set(venue.placeId, count(venue.placeId) + 1);
    usage.set(venue.activities[0]!, count(venue.activities[0]!) + 1);
    selected.push(plan.data);
  }
  return selected;
}
