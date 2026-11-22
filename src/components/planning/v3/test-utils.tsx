/** Test-only helpers. All server interactions in these tests are MOCKS. */
import { useState } from "react";
import type { PartyState } from "@/lib/party";
import type {
  HostConfigV3,
  LegacyPlanningState,
  MemberPreferencesV3,
  PlanningStateV3,
  PublicPlanV3,
} from "./contract";
import { HostSetupV3 } from "./HostSetupV3";
import { emptyHostDraft, type HostDraft } from "./host-model";
import { emptyMemberDraft, type MemberContext, type MemberDraft } from "./member-model";
import { MemberWizardV3 } from "./MemberWizardV3";

// 2026-11-22 19:10 in Montréal (UTC-5).
export const NOW = Date.parse("2026-11-23T00:10:00Z");
export const TODAY = "2026-11-22";
export const hostId = "00000000-0000-4000-8000-000000000001";
export const guestId = "00000000-0000-4000-8000-000000000002";
export const thirdId = "00000000-0000-4000-8000-000000000003";

export const party: PartyState = {
  code: "ABC123",
  selfId: hostId,
  isHost: true,
  started: false,
  view: "team",
  hangout: null,
  members: [
    { id: hostId, name: "Alex", host: true, location: null },
    { id: guestId, name: "Misha", host: false, location: null },
    { id: thirdId, name: "Sam", host: false, location: null },
  ],
};

export const v2State: LegacyPlanningState = {
  schemaVersion: 2,
  status: "collecting",
  revision: 4,
  config: {
    category: "park",
    date: TODAY,
    durationMin: 60,
    areaLabel: "Le Plateau",
    area: { lat: 45.52, lng: -73.58 },
  },
  selfPreferences: null,
  members: [
    { id: hostId, submitted: false },
    { id: guestId, submitted: true },
    { id: thirdId, submitted: false },
  ],
  plan: null,
  planIndex: 0,
  optionCount: 0,
  groupRerollsUsed: 0,
  votes: 0,
  voteThreshold: 2,
  selfVoted: false,
  noPlanReason: null,
  venueSource: null,
};

export const v3Config: HostConfigV3 = {
  version: 3,
  dateSelection: {
    mode: "future_dates",
    selectionStyle: "multiple",
    candidateDates: ["2026-11-24", "2026-11-26"],
    range: null,
  },
  duration: { mode: "fixed", minMinutes: 120, maxMinutes: 120 },
  area: {
    mode: "host_area",
    label: "Le Plateau",
    point: { lat: 45.52, lng: -73.58 },
    isStrict: false,
  },
  travelArrangement: { mode: "independent", sharedMeetingPoint: null, sharedMode: null },
  rules: {
    under18Friendly: false,
    freeOnly: false,
    alcoholPolicy: "allow",
    requiredAccessibility: [],
    dietaryHardRequirements: [],
  },
};

export const v3State = (patch: Partial<PlanningStateV3> = {}): PlanningStateV3 => ({
  status: "collecting",
  revision: 4,
  members: v2State.members,
  planIndex: 0,
  optionCount: 0,
  groupRerollsUsed: 0,
  votes: 0,
  voteThreshold: 2,
  selfVoted: false,
  noPlanReason: null,
  suggestedActions: [],
  schemaVersion: 3,
  config: v3Config,
  selfPreferences: null,
  plan: null,
  venueSource: null,
  ...patch,
});

/** A plan exactly as `publicPlanV3Schema` projects it. */
export const v3Plan: PublicPlanV3 = {
  version: 3,
  venue: {
    placeId: "fallback:parc-la-fontaine",
    name: "Parc La Fontaine",
    category: "outdoors",
    priceTier: null,
    location: { lat: 45.527, lng: -73.569 },
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Parc+La+Fontaine",
    outdoor: true,
    address: "3819 Avenue Calixa-Lavallée, Montréal, QC H2L 3A7",
    source: "curated",
    sourceTimestamp: "2026-11-22T05:00:00.000Z",
    attribution: [
      { name: "Ville de Montréal", url: "https://montreal.ca/en/places/parc-la-fontaine" },
    ],
    cost: {
      currency: "CAD",
      minCad: 0,
      maxCad: 0,
      free: true,
      confidence: "verified",
      checkedAt: "2026-11-22T05:00:00.000Z",
      sourceUrl: "https://montreal.ca/en/places/parc-la-fontaine",
    },
    bookingRequired: "no",
    bookingUrl: null,
    accessibilityVerified: false,
  },
  date: "2026-11-24",
  startAt: "2026-11-24T23:00:00.000Z",
  endAt: "2026-11-25T01:00:00.000Z",
  durationMinutes: 120,
  timeZone: "America/Montreal",
  routeVerifiability: "provider_verified",
  compromise: "Review this option",
  hoursUnknown: false,
  weather: { temperature: 3, precipitation: 10, code: 2 },
  warnings: ["availability_not_reserved"],
};

export const calendarContext: MemberContext = {
  availabilityMode: "calendar",
  candidateDates: ["2026-11-24", "2026-11-26"],
  sharedTravel: false,
  groupArea: { label: "Le Plateau", lat: 45.52, lng: -73.58 },
  freeOnly: false,
  minMinutes: 120,
  now: NOW,
};

export function HostHarness({
  canSave = true,
  save,
  initial,
}: {
  canSave?: boolean;
  save: (config: HostConfigV3) => Promise<boolean>;
  initial?: HostDraft;
}) {
  const [draft, setDraft] = useState<HostDraft>(initial ?? emptyHostDraft());
  return (
    <HostSetupV3
      draft={draft}
      onDraft={setDraft}
      today={TODAY}
      canSave={canSave}
      busy={false}
      save={save}
      onCancel={() => {}}
    />
  );
}

export function MemberHarness({
  context = calendarContext,
  canSave = true,
  save,
  initial,
  initialStep,
}: {
  context?: MemberContext;
  canSave?: boolean;
  save: (preferences: MemberPreferencesV3) => Promise<boolean>;
  initial?: MemberDraft;
  initialStep?: number;
}) {
  const [draft, setDraft] = useState<MemberDraft>(initial ?? emptyMemberDraft());
  return (
    <MemberWizardV3
      draft={draft}
      onDraft={setDraft}
      context={context}
      canSave={canSave}
      busy={false}
      hasSaved={false}
      save={save}
      onCancel={() => {}}
      {...(initialStep !== undefined ? { initialStep } : {})}
    />
  );
}

/** jsdom has no PointerEvent; a MouseEvent subclass carries clientX/Y and pointerId. */
export function installPointerEvent() {
  if (typeof window.PointerEvent !== "undefined") return;
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "touch";
    }
  }
  Object.defineProperty(window, "PointerEvent", { value: TestPointerEvent, configurable: true });
}
