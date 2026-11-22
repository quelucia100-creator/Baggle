import type { PlanningConfig } from "@/lib/planning/types";
import {
  hostConfigV3Schema,
  type AlcoholPolicy,
  type HostConfigV3,
  type TravelMode,
} from "./contract";
import {
  MAX_SELECTED_DAYS,
  addDays,
  daysBetween,
  expandRange,
  inHorizon,
  isValidIsoDate,
} from "./time";

export type DateMode = HostConfigV3["dateSelection"]["mode"];
export type SelectionStyle = "single" | "multiple" | "range";
export type LabelledPoint = { label: string; lat: number; lng: number };

export type HostDraft = {
  dateMode: DateMode | null;
  selectionStyle: SelectionStyle;
  pickedDates: string[];
  rangeStart: string | null;
  rangeEnd: string | null;
  durationMode: "fixed" | "flexible";
  fixedMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  areaMode: "host_area" | "optimize_for_group" | null;
  area: LabelledPoint | null;
  areaStrict: boolean;
  travelMode: "independent" | "together";
  meetingPoint: LabelledPoint | null;
  sharedMode: TravelMode | null;
  under18Friendly: boolean;
  freeOnly: boolean;
  alcoholPolicy: AlcoholPolicy;
  requiredAccessibility: string[];
  dietaryHardRequirements: string[];
};

export type HostSection = "when" | "where" | "rules" | "travel" | "duration";
export type HostErrors = Partial<Record<HostSection, string>>;

export const DURATION_CHOICES = [30, 60, 90, 120, 150, 180, 210, 240];
export const QUICK_DURATIONS = [60, 120, 180];

export function emptyHostDraft(): HostDraft {
  return {
    dateMode: null,
    selectionStyle: "single",
    pickedDates: [],
    rangeStart: null,
    rangeEnd: null,
    durationMode: "fixed",
    fixedMinutes: 120,
    minMinutes: 60,
    maxMinutes: 180,
    areaMode: null,
    area: null,
    areaStrict: false,
    travelMode: "independent",
    meetingPoint: null,
    sharedMode: null,
    under18Friendly: false,
    freeOnly: false,
    alcoholPolicy: "allow",
    requiredAccessibility: [],
    dietaryHardRequirements: [],
  };
}

export function hostDraftFromV3(config: HostConfigV3): HostDraft {
  const { dateSelection: dates, duration, area, travelArrangement: travel, rules } = config;
  return {
    dateMode: dates.mode,
    selectionStyle: dates.selectionStyle ?? "single",
    pickedDates: dates.range ? [] : [...dates.candidateDates],
    rangeStart: dates.range?.startDate ?? null,
    rangeEnd: dates.range?.endDate ?? null,
    durationMode: duration.mode,
    fixedMinutes: duration.minMinutes,
    minMinutes: duration.minMinutes,
    maxMinutes: duration.maxMinutes,
    areaMode: area.mode,
    area:
      area.point && area.label
        ? { label: area.label, lat: area.point.lat, lng: area.point.lng }
        : null,
    areaStrict: area.isStrict,
    travelMode: travel.mode,
    meetingPoint: travel.sharedMeetingPoint,
    sharedMode: travel.sharedMode,
    under18Friendly: rules.under18Friendly,
    freeOnly: rules.freeOnly,
    alcoholPolicy: rules.alcoholPolicy,
    requiredAccessibility: [...rules.requiredAccessibility],
    dietaryHardRequirements: [...rules.dietaryHardRequirements],
  };
}

/**
 * Read-only view of a V2 config so the V3 screens can preview against the current backend.
 * Fields V2 does not store stay unset; this never claims V2 persisted V3 choices.
 */
export function hostDraftFromV2(config: PlanningConfig, today: string): HostDraft {
  return {
    ...emptyHostDraft(),
    dateMode: config.date === today ? "today_tonight" : "future_dates",
    pickedDates: config.date === today ? [] : [config.date],
    durationMode: "fixed",
    fixedMinutes: config.durationMin - (config.durationMin % 30) || 30,
    areaMode: "host_area",
    area: { label: config.areaLabel, lat: config.area.lat, lng: config.area.lng },
  };
}

export function selectedDates(draft: HostDraft, today: string): string[] {
  if (draft.dateMode === "today_tonight") return [today];
  if (draft.dateMode === "best_day" || draft.selectionStyle === "range") {
    return draft.rangeStart && draft.rangeEnd ? expandRange(draft.rangeStart, draft.rangeEnd) : [];
  }
  return [...new Set(draft.pickedDates)].sort();
}

function validateWhen(draft: HostDraft, today: string): string | undefined {
  if (!draft.dateMode) return "Choose when this is happening.";
  if (draft.dateMode === "today_tonight") return undefined;
  const usesRange = draft.dateMode === "best_day" || draft.selectionStyle === "range";
  if (usesRange) {
    if (!draft.rangeStart || !draft.rangeEnd)
      return draft.dateMode === "best_day"
        ? "Choose the first and last day the app can pick from."
        : "Choose a start and end date for the range.";
    if (!isValidIsoDate(draft.rangeStart) || !isValidIsoDate(draft.rangeEnd))
      return "Choose valid dates.";
    if (draft.rangeEnd < draft.rangeStart) return "The range must end on or after its first day.";
    if (daysBetween(draft.rangeStart, draft.rangeEnd) + 1 > MAX_SELECTED_DAYS)
      return `A range can cover at most ${MAX_SELECTED_DAYS} days.`;
    if (!inHorizon(draft.rangeStart, today) || !inHorizon(draft.rangeEnd, today))
      return "Choose dates from today through the next 14 days.";
    if (draft.dateMode === "best_day" && draft.rangeStart === draft.rangeEnd)
      return "Give the app at least two days to choose between, or pick a future date instead.";
    return undefined;
  }
  const dates = selectedDates(draft, today);
  if (!dates.length) return "Pick at least one date.";
  if (draft.selectionStyle === "single" && dates.length !== 1) return "Pick exactly one date.";
  if (dates.length > MAX_SELECTED_DAYS) return `Pick at most ${MAX_SELECTED_DAYS} dates.`;
  if (dates.some((date) => !inHorizon(date, today)))
    return "Choose dates from today through the next 14 days.";
  return undefined;
}

export function validateHostDraft(draft: HostDraft, today: string): HostErrors {
  const errors: HostErrors = {};
  const when = validateWhen(draft, today);
  if (when) errors.when = when;
  if (!draft.areaMode) errors.where = "Choose a meeting area or let the app find one.";
  else if (draft.areaMode === "host_area" && !draft.area)
    errors.where = "Choose a real place for the meeting area.";
  if (draft.travelMode === "together") {
    if (!draft.meetingPoint) errors.travel = "Choose where everyone meets before travelling.";
    else if (!draft.sharedMode) errors.travel = "Choose how the group travels together.";
  }
  const durations =
    draft.durationMode === "fixed" ? [draft.fixedMinutes] : [draft.minMinutes, draft.maxMinutes];
  if (durations.some((minutes) => !DURATION_CHOICES.includes(minutes)))
    errors.duration = "Choose a duration from 30 minutes to 4 hours, in 30-minute steps.";
  else if (draft.durationMode === "flexible" && draft.minMinutes >= draft.maxMinutes)
    errors.duration = "The longest duration must be longer than the shortest.";
  return errors;
}

/** Build the exact canonical payload, or throw with per-section errors. */
export function hostPayload(draft: HostDraft, today: string): HostConfigV3 {
  const errors = validateHostDraft(draft, today);
  if (Object.keys(errors).length) throw Object.assign(new Error("invalid"), { errors });
  const usesRange =
    draft.dateMode === "best_day" ||
    (draft.dateMode === "future_dates" && draft.selectionStyle === "range");
  const config: HostConfigV3 = {
    version: 3,
    dateSelection: {
      mode: draft.dateMode as DateMode,
      selectionStyle: draft.dateMode === "future_dates" ? draft.selectionStyle : null,
      candidateDates: selectedDates(draft, today),
      range:
        usesRange && draft.rangeStart && draft.rangeEnd
          ? { startDate: draft.rangeStart, endDate: draft.rangeEnd }
          : null,
    },
    duration:
      draft.durationMode === "fixed"
        ? { mode: "fixed", minMinutes: draft.fixedMinutes, maxMinutes: draft.fixedMinutes }
        : { mode: "flexible", minMinutes: draft.minMinutes, maxMinutes: draft.maxMinutes },
    area:
      draft.areaMode === "host_area" && draft.area
        ? {
            mode: "host_area",
            label: draft.area.label,
            point: { lat: draft.area.lat, lng: draft.area.lng },
            isStrict: draft.areaStrict,
          }
        : { mode: "optimize_for_group", label: null, point: null, isStrict: false },
    travelArrangement:
      draft.travelMode === "together"
        ? { mode: "together", sharedMeetingPoint: draft.meetingPoint, sharedMode: draft.sharedMode }
        : { mode: "independent", sharedMeetingPoint: null, sharedMode: null },
    rules: {
      under18Friendly: draft.under18Friendly,
      freeOnly: draft.freeOnly,
      alcoholPolicy: draft.alcoholPolicy,
      requiredAccessibility: [...draft.requiredAccessibility].sort(),
      dietaryHardRequirements: [...draft.dietaryHardRequirements].sort(),
    },
  };
  return hostConfigV3Schema.parse(config);
}

/** Toggle a date in the shared calendar according to the current selection style. */
export function pickDate(draft: HostDraft, date: string): Partial<HostDraft> {
  const usesRange = draft.dateMode === "best_day" || draft.selectionStyle === "range";
  if (usesRange) {
    if (!draft.rangeStart || draft.rangeEnd) return { rangeStart: date, rangeEnd: null };
    if (date < draft.rangeStart) return { rangeStart: date, rangeEnd: draft.rangeStart };
    return { rangeEnd: date };
  }
  if (draft.selectionStyle === "single") return { pickedDates: [date] };
  return draft.pickedDates.includes(date)
    ? { pickedDates: draft.pickedDates.filter((entry) => entry !== date) }
    : { pickedDates: [...draft.pickedDates, date].sort() };
}

/** The latest date a range starting at `start` may end on, respecting both limits. */
export const rangeLimit = (start: string, today: string) => {
  const byLength = addDays(start, MAX_SELECTED_DAYS - 1);
  const byHorizon = addDays(today, 14);
  return byLength < byHorizon ? byLength : byHorizon;
};

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
