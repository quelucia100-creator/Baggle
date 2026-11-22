/**
 * LOCAL DEMO ONLY — SYNTHETIC DATA. Every person, venue, price and plan here is invented.
 * Plans are fixtures, NOT output of the matching engine; they prove UI behaviour only.
 */
import type { PartyState } from "@/lib/party";
import type { PlanningConfig } from "@/lib/planning/types";
import { wallTime } from "@/lib/planning/tz";
import type { HostConfigV3, MemberPreferencesV3, PublicPlanV3 } from "../contract";
import { hostPayload, emptyHostDraft, type HostDraft } from "../host-model";
import {
  emptyMemberDraft,
  memberPayload,
  type MemberContext,
  type MemberDraft,
} from "../member-model";
import { addDays, todayIn } from "../time";

export const DEMO_CODE = "DEMO00";
export const HOST_ID = "00000000-0000-4000-8000-00000000d001";
export const MISHA_ID = "00000000-0000-4000-8000-00000000d002";
export const SAM_ID = "00000000-0000-4000-8000-00000000d003";
export const DEMO_PEOPLE = [
  { id: HOST_ID, name: "Alex (demo host)", host: true },
  { id: MISHA_ID, name: "Misha (demo)", host: false },
  { id: SAM_ID, name: "Sam (demo)", host: false },
] as const;

export function demoParty(selfId: string): PartyState {
  const self = DEMO_PEOPLE.find((person) => person.id === selfId) ?? DEMO_PEOPLE[0];
  return {
    code: DEMO_CODE,
    selfId: self.id,
    isHost: self.host,
    started: false,
    view: "team",
    hangout: null,
    members: DEMO_PEOPLE.map((person) => ({ ...person, location: null })),
  };
}

export const SCENARIOS = [
  {
    id: "tonight",
    label: "Tonight",
    note: "Today/Tonight mode with leave-by and home-by choices.",
  },
  {
    id: "multi",
    label: "Multiple future dates",
    note: "Three picked days, flexible length, app-chosen area.",
  },
  {
    id: "overnight",
    label: "Overnight",
    note: "Late start that runs past midnight; group travels together.",
  },
  {
    id: "nomatch",
    label: "No matching plan",
    note: "Find-best-day range; locking returns the neutral no-plan screen.",
  },
  {
    id: "legacy",
    label: "Old party → switch to V3",
    note: "Starts as a current-planner (V2) party the host converts.",
  },
] as const;
export type ScenarioId = (typeof SCENARIOS)[number]["id"];

const plateau = { label: "Le Plateau", lat: 45.52, lng: -73.58 };
const downtown = { label: "Downtown", lat: 45.5, lng: -73.57 };

export function scenarioConfig(id: ScenarioId, now: number): HostConfigV3 {
  const today = todayIn(now);
  const base: HostDraft = { ...emptyHostDraft(), areaMode: "host_area", area: plateau };
  const drafts: Record<Exclude<ScenarioId, "legacy">, HostDraft> = {
    tonight: { ...base, dateMode: "today_tonight", fixedMinutes: 90 },
    multi: {
      ...base,
      dateMode: "future_dates",
      selectionStyle: "multiple",
      pickedDates: [addDays(today, 2), addDays(today, 4), addDays(today, 6)],
      durationMode: "flexible",
      minMinutes: 60,
      maxMinutes: 180,
      areaMode: "optimize_for_group",
      area: null,
      under18Friendly: true,
    },
    overnight: {
      ...base,
      dateMode: "future_dates",
      selectionStyle: "single",
      pickedDates: [addDays(today, 1)],
      fixedMinutes: 150,
      travelMode: "together",
      meetingPoint: downtown,
      sharedMode: "transit",
    },
    nomatch: {
      ...base,
      dateMode: "best_day",
      rangeStart: addDays(today, 1),
      rangeEnd: addDays(today, 3),
      fixedMinutes: 240,
      areaStrict: true,
      freeOnly: true,
      alcoholPolicy: "alcohol_free_only",
    },
  };
  return hostPayload(drafts[id === "legacy" ? "tonight" : id], today);
}

export function legacyConfig(now: number): PlanningConfig {
  return {
    date: todayIn(now),
    durationMin: 60,
    areaLabel: plateau.label,
    area: { lat: plateau.lat, lng: plateau.lng },
    category: "park",
  };
}

export function contextFor(config: HostConfigV3, now: number): MemberContext {
  return {
    availabilityMode: config.dateSelection.mode === "today_tonight" ? "tonight" : "calendar",
    candidateDates: config.dateSelection.candidateDates,
    sharedTravel: config.travelArrangement.mode === "together",
    groupArea:
      config.area.mode === "host_area" && config.area.point && config.area.label
        ? { label: config.area.label, ...config.area.point }
        : null,
    freeOnly: config.rules.freeOnly,
    minMinutes: config.duration.minMinutes,
    now,
  };
}

/** Slot indices from `fromHour` (inclusive) to `toHour` (exclusive) on the 60-slot grid. */
const hours = (fromHour: number, toHour: number) =>
  Array.from({ length: (toHour - fromHour) * 2 }, (_, index) => fromHour * 2 + index);

/** Synthetic answers for a simulated participant, built through the real payload builder. */
export function syntheticAnswers(
  memberId: string,
  config: HostConfigV3,
  now: number,
): MemberPreferencesV3 {
  const context = contextFor(config, now);
  const flavour = memberId === MISHA_ID ? 0 : 1;
  const draft: MemberDraft = {
    ...emptyMemberDraft(),
    vibes: flavour ? ["adventurous"] : ["chill_cozy", "creative"],
    likedActivities: flavour ? ["outdoors", "games"] : ["arts_culture", "food_cafes"],
    excludedActivities: flavour ? ["nightlife"] : [],
    preferredMinCad: 0,
    preferredMaxCad: flavour ? 25 : 40,
    ceiling: flavour ? { kind: "cap", cad: 35 } : { kind: "unlimited" },
    departure: { kind: "anytime" },
    returnBy: { kind: "none" },
    days: Object.fromEntries(
      context.candidateDates.map((date) => [
        date,
        {
          confirmed: true,
          // Busy through the working day; the overnight scenario is busy until 10 PM.
          busy: config.duration.minMinutes >= 150 ? hours(7, 22) : hours(9, flavour ? 17 : 18),
        },
      ]),
    ),
    origin: context.groupArea
      ? { source: "group_area", label: context.groupArea.label }
      : {
          source: "manual",
          label: flavour ? "Verdun" : "Mile End",
          lat: flavour ? 45.46 : 45.52,
          lng: flavour ? -73.57 : -73.6,
        },
    travelMode: flavour ? "bike" : "transit",
    maxOneWayMinutes: flavour ? 25 : 40,
    alreadyAtSharedMeetingPoint: false,
  };
  if (context.availabilityMode === "tonight") draft.days = {};
  return memberPayload(draft, context);
}

type Template = {
  name: string;
  category: PublicPlanV3["venue"]["category"];
  outdoor: boolean;
  cost: PublicPlanV3["venue"]["cost"];
  booking: PublicPlanV3["venue"]["bookingRequired"];
  warnings: PublicPlanV3["warnings"];
};
const checkedAt = (now: number) => new Date(now - 86_400_000).toISOString();
const templates = (now: number): Template[] => [
  {
    name: "[Demo] Lantern Park",
    category: "outdoors",
    outdoor: true,
    cost: {
      currency: "CAD",
      minCad: 0,
      maxCad: 0,
      free: true,
      confidence: "verified",
      checkedAt: checkedAt(now),
      sourceUrl: "https://example.com/demo-price-source",
    },
    booking: "no",
    warnings: ["availability_not_reserved"],
  },
  {
    name: "[Demo] Pixel Arcade Café",
    category: "games",
    outdoor: false,
    cost: {
      currency: "CAD",
      minCad: 15,
      maxCad: 25,
      free: false,
      confidence: "verified",
      checkedAt: checkedAt(now),
      sourceUrl: "https://example.com/demo-price-source",
    },
    booking: "yes",
    warnings: ["availability_not_reserved"],
  },
  {
    name: "[Demo] Mural Walk Gallery",
    category: "arts_culture",
    outdoor: false,
    cost: null,
    booking: "unknown",
    warnings: ["cost_unknown", "booking_unknown", "route_estimates"],
  },
];

/** Start of the synthetic plan for a candidate day, per scenario. */
function startFor(id: ScenarioId, date: string, now: number, index: number) {
  if (id === "tonight" || id === "legacy") {
    const next = Math.ceil((now + 30 * 60_000) / 1_800_000) * 1_800_000;
    return next + index * 30 * 60_000;
  }
  if (id === "overnight") return wallTime(date, index === 1 ? "23:00" : "23:30");
  return wallTime(date, index === 2 ? "19:30" : "18:30");
}

export function syntheticOptions(
  id: ScenarioId,
  config: HostConfigV3,
  now: number,
): PublicPlanV3[] {
  const dates = config.dateSelection.candidateDates;
  return templates(now).map((template, index) => {
    const date = dates[index % dates.length] ?? todayIn(now);
    const start = startFor(id, date, now, index);
    const minutes = config.duration.minMinutes;
    const zonedDate = todayIn(start);
    return {
      version: 3,
      venue: {
        placeId: `demo:${index}`,
        name: template.name,
        category: template.category,
        priceTier: null,
        location: { lat: 45.51 + index / 100, lng: -73.57 },
        mapsUrl: "https://example.com/demo-map",
        outdoor: template.outdoor,
        address: `${100 + index * 11} Rue Synthétique (demo address), Montréal`,
        source: "curated",
        sourceTimestamp: checkedAt(now),
        attribution: [{ name: "Synthetic demo fixture", url: null }],
        cost: template.cost,
        bookingRequired: template.booking,
        bookingUrl: template.booking === "yes" ? "https://example.com/demo-booking" : null,
        accessibilityVerified: index === 1,
      },
      date: zonedDate,
      startAt: new Date(start).toISOString(),
      endAt: new Date(start + minutes * 60_000).toISOString(),
      durationMinutes: minutes,
      timeZone: "America/Montreal",
      routeVerifiability: "provider_verified",
      compromise: "Review this option",
      hoursUnknown: false,
      weather: template.outdoor ? { temperature: -2, precipitation: 10, code: 2 } : null,
      warnings: template.outdoor ? template.warnings : [...template.warnings, "forecast_unknown"],
    } satisfies PublicPlanV3;
  });
}
