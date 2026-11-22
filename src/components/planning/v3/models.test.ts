import { describe, expect, it } from "vitest";
import { buildIcs } from "./ics";
import {
  emptyHostDraft,
  hostDraftFromV3,
  hostPayload,
  pickDate,
  validateHostDraft,
  type HostDraft,
} from "./host-model";
import {
  emptyMemberDraft,
  matchingPreset,
  memberDraftFromV3,
  memberPayload,
  validateMemberStep,
  type MemberContext,
  type MemberDraft,
} from "./member-model";
import { daySlots, expandRange, intervalsToSlots, slotsToIntervals, tonightOptions } from "./time";
import { backendSupportsV3, type HostConfigV3 } from "./contract";
import { normalizeConfig, normalizePreferences, unambiguous } from "@/lib/planning-v3/schema";

const today = "2026-11-22";
// 2026-11-22 19:10 in Montreal (EST, UTC-5).
const now = Date.parse("2026-11-23T00:10:00Z");

describe("V3 time grid", () => {
  it("covers a full day plus labelled overnight spillover in 30-minute slots", () => {
    const slots = daySlots("2026-11-24");
    expect(slots).toHaveLength(60);
    expect(slots[0]).toMatchObject({ label: "12:00 AM", overnight: false, clock: "normal" });
    expect(slots[48]).toMatchObject({ civilDate: "2026-11-25", overnight: true });
    expect(new Date(slots[0]!.startMs!).toISOString()).toBe("2026-11-24T05:00:00.000Z");
  });

  it("merges contiguous busy slots into sorted UTC intervals and round-trips", () => {
    const slots = daySlots("2026-11-24");
    const busy = new Set([20, 21, 22, 40, 47, 48, 49]);
    const intervals = slotsToIntervals(slots, busy);
    expect(intervals).toEqual([
      { startAt: "2026-11-24T15:00:00.000Z", endAt: "2026-11-24T16:30:00.000Z" },
      { startAt: "2026-11-25T01:00:00.000Z", endAt: "2026-11-25T01:30:00.000Z" },
      // 23:30 through 01:00 the next day crosses midnight as one interval.
      { startAt: "2026-11-25T04:30:00.000Z", endAt: "2026-11-25T06:00:00.000Z" },
    ]);
    expect([...intervalsToSlots(slots, intervals)].sort((a, b) => a - b)).toEqual(
      [...busy].sort((a, b) => a - b),
    );
  });

  it("marks spring-forward wall times as skipped and merges across the gap", () => {
    const slots = daySlots("2026-03-08");
    expect(slots[4]!.clock).toBe("skipped");
    expect(slots[5]!.clock).toBe("skipped");
    expect(slots[4]!.startMs).toBeNull();
    expect(slotsToIntervals(slots, new Set([3, 4, 5, 6]))).toEqual([
      { startAt: "2026-03-08T06:30:00.000Z", endAt: "2026-03-08T07:30:00.000Z" },
    ]);
  });

  it("blocks both occurrences of a repeated fall-back slot", () => {
    const slots = daySlots("2026-11-01");
    expect(slots[2]!.clock).toBe("repeated");
    // The server rejects endpoints on the repeated 1:00/1:30 wall times, so the interval is
    // widened outward (00:30 EDT → 02:00 EST). It can only add busy time.
    const [interval] = slotsToIntervals(slots, new Set([2]));
    expect(interval).toEqual({
      startAt: "2026-11-01T04:30:00.000Z",
      endAt: "2026-11-01T07:00:00.000Z",
    });
    expect(unambiguous(Date.parse(interval!.startAt), true)).toBe(true);
    expect(unambiguous(Date.parse(interval!.endAt), true)).toBe(true);
  });

  it("offers tonight times from now with next-day labels after midnight", () => {
    const { departures, returns } = tonightOptions(now);
    expect(departures[0]).toMatchObject({ label: "7:30 PM", nextDay: false });
    // The server only accepts departures before midnight tonight.
    expect(departures.at(-1)?.label).toBe("11:30 PM");
    expect(departures.some((entry) => entry.nextDay)).toBe(false);
    const late = returns.find((entry) => entry.value === "2026-11-23T06:00:00.000Z");
    expect(late?.label).toBe("1:00 AM (next day)");
    expect(returns.at(-1)).toMatchObject({
      label: "6:00 AM (next day)",
      value: "2026-11-23T11:00:00.000Z",
    });
  });
});

describe("V3 host setup model", () => {
  const base = {
    ...emptyHostDraft(),
    areaMode: "host_area" as const,
    area: { label: "Le Plateau", lat: 45.52, lng: -73.58 },
  };

  it("requires a date mode, real area and shared meeting details", () => {
    const errors = validateHostDraft({ ...emptyHostDraft(), travelMode: "together" }, today);
    expect(errors.when).toMatch(/when/);
    expect(errors.where).toMatch(/meeting area/);
    expect(errors.travel).toMatch(/meets/);
  });

  it("materializes today, multiple dates and ranges in the canonical shape", () => {
    expect(hostPayload({ ...base, dateMode: "today_tonight" }, today).dateSelection).toEqual({
      mode: "today_tonight",
      selectionStyle: null,
      candidateDates: [today],
      range: null,
    });
    let draft: HostDraft = { ...base, dateMode: "future_dates", selectionStyle: "multiple" };
    draft = { ...draft, ...pickDate(draft, "2026-11-30") };
    draft = { ...draft, ...pickDate(draft, "2026-11-25") };
    expect(hostPayload(draft, today).dateSelection.candidateDates).toEqual([
      "2026-11-25",
      "2026-11-30",
    ]);
    const best = {
      ...base,
      dateMode: "best_day" as const,
      rangeStart: "2026-11-23",
      rangeEnd: "2026-11-26",
    };
    expect(hostPayload(best, today).dateSelection).toMatchObject({
      selectionStyle: null,
      candidateDates: expandRange("2026-11-23", "2026-11-26"),
      range: { startDate: "2026-11-23", endDate: "2026-11-26" },
    });
  });

  it("enforces the 14-day range and today+14 horizon", () => {
    const tooLong = {
      ...base,
      dateMode: "best_day" as const,
      rangeStart: today,
      rangeEnd: "2026-12-06",
    };
    expect(validateHostDraft(tooLong, today).when).toMatch(/14 days/);
    const fourteen = { ...tooLong, rangeEnd: "2026-12-05" };
    expect(validateHostDraft(fourteen, today).when).toBeUndefined();
    const past = { ...base, dateMode: "future_dates" as const, pickedDates: ["2026-11-21"] };
    expect(validateHostDraft(past, today).when).toMatch(/today through/);
    const horizonEdge = { ...past, pickedDates: ["2026-12-06"] };
    expect(validateHostDraft(horizonEdge, today).when).toBeUndefined();
    expect(validateHostDraft({ ...past, pickedDates: ["2026-12-07"] }, today).when).toBeDefined();
  });

  it("uses min=max for fixed durations and rejects inverted flexible ranges", () => {
    const config = hostPayload({ ...base, dateMode: "today_tonight", fixedMinutes: 90 }, today);
    expect(config.duration).toEqual({ mode: "fixed", minMinutes: 90, maxMinutes: 90 });
    expect(
      validateHostDraft(
        {
          ...base,
          dateMode: "today_tonight",
          durationMode: "flexible",
          minMinutes: 120,
          maxMinutes: 60,
        },
        today,
      ).duration,
    ).toBeDefined();
  });

  it("round-trips a saved config back into an editable draft", () => {
    const config = hostPayload(
      {
        ...base,
        dateMode: "future_dates",
        selectionStyle: "range",
        rangeStart: "2026-11-24",
        rangeEnd: "2026-11-27",
        travelMode: "together",
        meetingPoint: { label: "Downtown", lat: 45.5, lng: -73.57 },
        sharedMode: "transit",
        alcoholPolicy: "alcohol_free_only",
        requiredAccessibility: ["wheelchair_accessible_entrance"],
      },
      today,
    );
    expect(hostPayload(hostDraftFromV3(config), today)).toEqual(config);
  });
});

describe("V3 member model", () => {
  const context: MemberContext = {
    availabilityMode: "calendar",
    candidateDates: ["2026-11-24", "2026-11-25"],
    sharedTravel: false,
    groupArea: null,
    freeOnly: false,
    minMinutes: 60,
    now,
  };
  const complete: MemberDraft = {
    ...emptyMemberDraft(),
    vibes: ["creative"],
    likedActivities: ["arts_culture"],
    excludedActivities: ["nightlife"],
    preferredMinCad: 15,
    preferredMaxCad: 30,
    ceiling: { kind: "cap", cad: 40 },
    days: {
      "2026-11-24": { busy: [20, 21], confirmed: true },
      "2026-11-25": { busy: [], confirmed: true },
    },
    origin: { source: "manual", label: "Mile End", lat: 45.52, lng: -73.6 },
    travelMode: "bike",
    maxOneWayMinutes: 25,
  };

  it("never defaults an absent ceiling to unlimited", () => {
    expect(validateMemberStep({ ...complete, ceiling: null }, "budget", context)).toMatch(
      /No hard limit/,
    );
    const unlimited = memberPayload({ ...complete, ceiling: { kind: "unlimited" } }, context);
    expect(unlimited.budget).toEqual({
      currency: "CAD",
      preferredMinCad: 15,
      preferredMaxCad: 30,
      hardMaxCad: null,
      explicitlyUnlimited: true,
    });
    expect(
      validateMemberStep({ ...complete, ceiling: { kind: "cap", cad: 20 } }, "budget", context),
    ).toMatch(/at least/);
    expect(matchingPreset({ preferredMinCad: 15, preferredMaxCad: 30 })).toBe("15-30");
  });

  it("requires every candidate day to be confirmed and at least one free window", () => {
    const unconfirmed = { ...complete, days: { "2026-11-24": { busy: [], confirmed: true } } };
    expect(validateMemberStep(unconfirmed, "availability", context)).toMatch(/1 left/);
    const allBusy = Object.fromEntries(
      context.candidateDates.map((date) => [
        date,
        { busy: Array.from({ length: 60 }, (_, i) => i), confirmed: true },
      ]),
    );
    expect(validateMemberStep({ ...complete, days: allBusy }, "availability", context)).toMatch(
      /at least one/,
    );
  });

  it("keeps likes and hard no's disjoint", () => {
    expect(
      validateMemberStep({ ...complete, likedActivities: ["nightlife"] }, "activities", context),
    ).toMatch(/both/);
  });

  it("builds merged intervals and round-trips through a saved answer", () => {
    const payload = memberPayload(complete, context);
    expect(payload.availability.days[0]).toEqual({
      date: "2026-11-24",
      confirmed: true,
      busyIntervals: [{ startAt: "2026-11-24T15:00:00.000Z", endAt: "2026-11-24T16:00:00.000Z" }],
    });
    expect(payload.travel).toEqual({
      mode: "bike",
      maxOneWayMinutes: 25,
      returnMode: null,
      alreadyAtSharedMeetingPoint: false,
    });
    expect(memberPayload(memberDraftFromV3(payload), context)).toEqual(payload);
  });

  it("validates tonight independent IDC choices", () => {
    const tonight = { ...context, availabilityMode: "tonight" as const, candidateDates: [today] };
    const draft = {
      ...complete,
      departure: { kind: "anytime" as const },
      returnBy: { kind: "none" as const },
    };
    expect(memberPayload(draft, tonight).availability).toEqual({
      mode: "tonight",
      tonight: {
        earliestDepartureAt: null,
        latestReturnAt: null,
        anytimeFromNow: true,
        noReturnDeadline: true,
      },
      days: [],
    });
    expect(
      validateMemberStep(
        {
          ...draft,
          departure: { kind: "at", at: "2026-11-23T03:00:00.000Z" },
          returnBy: { kind: "at", at: "2026-11-23T02:00:00.000Z" },
        },
        "availability",
        tonight,
      ),
    ).toMatch(/after/);
    expect(validateMemberStep({ ...draft, returnBy: null }, "availability", tonight)).toMatch(
      /No deadline/,
    );
  });
});

/**
 * Contract checks against the AUTHORITATIVE backend validators (src/lib/planning-v3/schema.ts).
 * These prove the frontend payload shape; they don't exercise the database.
 */
describe("Payloads accepted by the backend validators", () => {
  const area = { label: "Le Plateau", lat: 45.52, lng: -73.58 };
  const hostBase = { ...emptyHostDraft(), areaMode: "host_area" as const, area, fixedMinutes: 60 };
  const memberBase: MemberDraft = {
    ...emptyMemberDraft(),
    vibes: ["social_lively"],
    likedActivities: ["surprise"],
    ceiling: { kind: "cap", cad: 40 },
    origin: { source: "manual", label: "Mile End", lat: 45.52, lng: -73.6 },
    travelMode: "transit",
  };

  it.each([
    ["today", { ...hostBase, dateMode: "today_tonight" as const }],
    ["single", { ...hostBase, dateMode: "future_dates" as const, pickedDates: ["2026-11-25"] }],
    [
      "multiple",
      {
        ...hostBase,
        dateMode: "future_dates" as const,
        selectionStyle: "multiple" as const,
        pickedDates: ["2026-11-25", "2026-11-28"],
      },
    ],
    [
      "range",
      {
        ...hostBase,
        dateMode: "future_dates" as const,
        selectionStyle: "range" as const,
        rangeStart: "2026-11-23",
        rangeEnd: "2026-12-06",
      },
    ],
    [
      "best day + together + optimize",
      {
        ...hostBase,
        dateMode: "best_day" as const,
        rangeStart: "2026-11-24",
        rangeEnd: "2026-11-27",
        areaMode: "optimize_for_group" as const,
        travelMode: "together" as const,
        meetingPoint: { label: "Downtown", lat: 45.5, lng: -73.57 },
        sharedMode: "bike" as const,
        durationMode: "flexible" as const,
        minMinutes: 60,
        maxMinutes: 180,
        requiredAccessibility: ["wheelchair_accessible_entrance"],
      },
    ],
  ])("host config: %s", (_name, draft) => {
    const config = hostPayload(draft, today);
    expect(normalizeConfig(config, now)).toEqual(config);
  });

  const calendarConfig: HostConfigV3 = hostPayload(
    {
      ...hostBase,
      dateMode: "future_dates",
      selectionStyle: "multiple",
      pickedDates: ["2026-11-24", "2026-11-25"],
    },
    today,
  );
  const calendarContext: MemberContext = {
    availabilityMode: "calendar",
    candidateDates: ["2026-11-24", "2026-11-25"],
    sharedTravel: false,
    groupArea: area,
    freeOnly: false,
    minMinutes: 60,
    now,
  };

  it("member answers with painted days, including an overnight block", () => {
    const draft = {
      ...memberBase,
      days: {
        "2026-11-24": { busy: [18, 19, 20, 46, 47, 48, 49], confirmed: true },
        "2026-11-25": { busy: [], confirmed: true },
      },
    };
    const payload = memberPayload(draft, calendarContext);
    expect(normalizePreferences(structuredClone(payload), calendarConfig, now)).toEqual(payload);
  });

  it("group-area origin is sent without coordinates or label", () => {
    const payload = memberPayload(
      {
        ...memberBase,
        origin: { source: "group_area", label: "Le Plateau" },
        days: {
          "2026-11-24": { busy: [], confirmed: true },
          "2026-11-25": { busy: [], confirmed: true },
        },
      },
      calendarContext,
    );
    expect(payload.origin).toEqual({
      source: "group_area",
      label: null,
      lat: null,
      lng: null,
      accuracy: "approximate",
    });
    expect(() => normalizePreferences(structuredClone(payload), calendarConfig, now)).not.toThrow();
  });

  it("tonight answers with specific times and with both I-don't-care choices", () => {
    const tonightConfig = hostPayload({ ...hostBase, dateMode: "today_tonight" }, today);
    const tonight = {
      ...calendarContext,
      availabilityMode: "tonight" as const,
      candidateDates: [today],
    };
    const { departures, returns } = tonightOptions(now);
    const timed = memberPayload(
      {
        ...memberBase,
        departure: { kind: "at", at: departures.at(-1)!.value },
        returnBy: { kind: "at", at: returns.at(-1)!.value },
      },
      tonight,
    );
    expect(() => normalizePreferences(structuredClone(timed), tonightConfig, now)).not.toThrow();
    const anytime = memberPayload(
      { ...memberBase, departure: { kind: "anytime" }, returnBy: { kind: "none" } },
      tonight,
    );
    expect(() => normalizePreferences(structuredClone(anytime), tonightConfig, now)).not.toThrow();
  });

  it("rejects too-short windows and days the database won't store, before sending", () => {
    const shortWindow = {
      ...memberBase,
      days: {
        "2026-11-24": { busy: daySlotsBusyExcept([20]), confirmed: true },
        "2026-11-25": { busy: daySlotsBusyExcept([30]), confirmed: true },
      },
    };
    expect(validateMemberStep(shortWindow, "availability", calendarContext)).toMatch(
      /60 minutes long/,
    );
    const oneFullyBusy = {
      ...memberBase,
      days: {
        "2026-11-24": { busy: daySlotsBusyExcept([]), confirmed: true },
        "2026-11-25": { busy: [], confirmed: true },
      },
    };
    expect(validateMemberStep(oneFullyBusy, "availability", calendarContext)).toMatch(
      /busy all day/,
    );
  });
});

function daySlotsBusyExcept(free: number[]) {
  return Array.from({ length: 60 }, (_, index) => index).filter((index) => !free.includes(index));
}

describe("V3 helpers", () => {
  it("only treats explicit schemaVersion 3 state as V3-capable", () => {
    expect(backendSupportsV3({ status: "collecting" })).toBe(false);
    expect(backendSupportsV3({ schemaVersion: 3 })).toBe(true);
  });

  it("builds an RFC 5545 calendar file from confirmed UTC timestamps", () => {
    const ics = buildIcs({
      uid: "ABC123-0@baggle",
      title: "Baggle: Parc, La Fontaine",
      startAt: "2026-11-24T23:00:00.000Z",
      endAt: "2026-11-25T01:00:00.000Z",
      location: "Parc La Fontaine; Montréal",
      now: Date.parse("2026-11-22T00:00:00Z"),
    });
    expect(ics).toContain("DTSTART:20261124T230000Z\r\n");
    expect(ics).toContain("DTEND:20261125T010000Z\r\n");
    expect(ics).toContain("SUMMARY:Baggle: Parc\\, La Fontaine");
    expect(ics).toContain("LOCATION:Parc La Fontaine\\; Montréal");
    expect(() =>
      buildIcs({
        uid: "x",
        title: "x",
        startAt: "2026-11-25T01:00:00Z",
        endAt: "2026-11-24T01:00:00Z",
      }),
    ).toThrow();
  });
});
