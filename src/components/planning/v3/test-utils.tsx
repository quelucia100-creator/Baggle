/** Test-only helpers. All server interactions in these tests are MOCKS. */
import { useState } from "react";
import type { PartyState } from "@/lib/party";
import type { PlanningState } from "@/lib/planning/types";
import type { HostConfigV3, MemberPreferencesV3, PlanningStateV3 } from "./contract";
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

export const v2State: PlanningState = {
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
  ...v2State,
  schemaVersion: 3,
  config: v3Config,
  selfPreferences: null,
  ...patch,
});

export const calendarContext: MemberContext = {
  availabilityMode: "calendar",
  candidateDates: ["2026-11-24", "2026-11-26"],
  sharedTravel: false,
  groupArea: { label: "Le Plateau", lat: 45.52, lng: -73.58 },
  freeOnly: false,
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
