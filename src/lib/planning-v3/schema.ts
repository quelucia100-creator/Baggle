import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { PLANNING_TIME_ZONE, localDay, shiftDate, wallTime } from "../planning/tz";

export const modes = ["walk", "transit", "drive", "bike"] as const;
export const vibes = [
  "chill_cozy",
  "social_lively",
  "adventurous",
  "competitive",
  "creative",
  "surprise_me",
] as const;
export const activities = [
  "food_cafes",
  "games",
  "sports",
  "outdoors",
  "arts_culture",
  "entertainment",
  "nightlife",
] as const;
const likes = [...activities, "surprise"] as const;
const unique = (items: readonly string[]) => new Set(items).size === items.length;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    try {
      return Temporal.PlainDate.from(value).toString() === value;
    } catch {
      return false;
    }
  });
const label = z.string().trim().min(1).max(160);
const coord = {
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
};
export const pointV3 = z.object(coord).strict();
const minutes = z.number().int().min(30).max(240).multipleOf(30);
const tags = z
  .array(z.string().regex(/^[a-z0-9_]{1,40}$/))
  .max(20)
  .refine(unique);
export const MAX_NOTE_LENGTH = 280;
export const optionalNoteSchema = z
  .string()
  .refine((note) => !/\p{Cc}/u.test(note))
  .transform((note) => note.trim())
  .pipe(z.string().max(MAX_NOTE_LENGTH))
  .nullable();
const instant = z
  .string()
  .datetime({ precision: 0 })
  .or(z.string().datetime({ precision: 3 }))
  .refine((value) => {
    try {
      Temporal.Instant.from(value);
      return true;
    } catch {
      return false;
    }
  });
const timeBudget = z.number().int().min(5).max(90);
const budget = z.number().int().min(0).max(500).multipleOf(5);
const mode = z.enum(modes);

export const hostConfigV3Schema = z
  .object({
    version: z.literal(3),
    dateSelection: z
      .object({
        mode: z.enum(["today_tonight", "future_dates", "best_day"]),
        selectionStyle: z.enum(["single", "multiple", "range"]).nullable(),
        candidateDates: z.array(date).max(14).refine(unique),
        range: z.object({ startDate: date, endDate: date }).strict().nullable(),
      })
      .strict(),
    duration: z
      .object({ mode: z.enum(["fixed", "flexible"]), minMinutes: minutes, maxMinutes: minutes })
      .strict(),
    area: z
      .object({
        mode: z.enum(["host_area", "optimize_for_group"]),
        label: label.nullable(),
        point: pointV3.nullable(),
        isStrict: z.boolean(),
      })
      .strict(),
    travelArrangement: z
      .object({
        mode: z.enum(["independent", "together"]),
        sharedMeetingPoint: pointV3.extend({ label }).nullable(),
        sharedMode: mode.nullable(),
      })
      .strict(),
    rules: z
      .object({
        under18Friendly: z.boolean(),
        freeOnly: z.boolean(),
        alcoholPolicy: z.enum(["allow", "no_age_restricted", "alcohol_free_only"]),
        requiredAccessibility: tags,
        dietaryHardRequirements: tags,
      })
      .strict(),
  })
  .strict()
  .refine(
    ({ duration, area, travelArrangement }) =>
      duration.minMinutes <= duration.maxMinutes &&
      (duration.mode !== "fixed" || duration.minMinutes === duration.maxMinutes) &&
      (area.mode === "host_area"
        ? !!area.point && !!area.label
        : !area.isStrict && area.point === null && area.label === null) &&
      (travelArrangement.mode === "together"
        ? !!travelArrangement.sharedMeetingPoint && !!travelArrangement.sharedMode
        : travelArrangement.sharedMeetingPoint === null && travelArrangement.sharedMode === null),
  );

export type HostConfigV3 = z.infer<typeof hostConfigV3Schema>;
export type Mode = z.infer<typeof mode>;
export type Point = z.infer<typeof pointV3>;

export class InvalidPlanningInput extends Error {
  constructor() {
    super("Check the planning dates, choices and availability and try again.");
  }
}
function requireValid(valid: unknown): asserts valid {
  if (!valid) throw new InvalidPlanningInput();
}

export function normalizeConfig(input: unknown, now: number, persisted = false): HostConfigV3 {
  const parsed = hostConfigV3Schema.safeParse(input);
  requireValid(parsed.success);
  const config = parsed.data;
  const selection = config.dateSelection;
  const today = localDay(now).date;
  const last = shiftDate(today, 14);
  const supplied = [...selection.candidateDates].sort();
  let candidateDates: string[];
  if (selection.mode === "today_tonight") {
    requireValid(selection.selectionStyle === null && selection.range === null);
    candidateDates = persisted ? supplied : [today];
    requireValid(
      candidateDates.length === 1 &&
        supplied.length <= 1 &&
        (supplied.length === 0 || supplied[0] === candidateDates[0]),
    );
  } else if (selection.mode === "best_day" || selection.selectionStyle === "range") {
    requireValid(
      selection.range &&
        (selection.mode !== "best_day" ||
          selection.selectionStyle === null ||
          selection.selectionStyle === "range"),
    );
    const { startDate, endDate } = selection.range;
    requireValid(startDate <= endDate && endDate <= shiftDate(startDate, 13));
    candidateDates = [];
    for (let day = startDate; day <= endDate; day = shiftDate(day, 1)) candidateDates.push(day);
    requireValid(supplied.length === 0 ? !persisted : supplied.join() === candidateDates.join());
  } else {
    requireValid(
      selection.range === null &&
        (selection.selectionStyle === "single"
          ? supplied.length === 1
          : selection.selectionStyle === "multiple" && supplied.length > 0),
    );
    candidateDates = supplied;
  }
  requireValid(persisted || candidateDates.every((day) => day >= today && day <= last));
  return { ...config, dateSelection: { ...selection, candidateDates } };
}

const busy = z.object({ startAt: instant, endAt: instant }).strict();
const daySchema = z
  .object({ date, confirmed: z.boolean(), busyIntervals: z.array(busy).max(64) })
  .strict();
const tonightSchema = z
  .object({
    earliestDepartureAt: instant.nullable(),
    latestReturnAt: instant.nullable(),
    anytimeFromNow: z.boolean(),
    noReturnDeadline: z.boolean(),
  })
  .strict()
  .refine(
    (data) =>
      data.anytimeFromNow === (data.earliestDepartureAt === null) &&
      data.noReturnDeadline === (data.latestReturnAt === null),
  );

export const memberPreferencesV3Schema = z
  .object({
    version: z.literal(3),
    vibes: z.array(z.enum(vibes)).min(1).max(2).refine(unique),
    likedActivities: z.array(z.enum(likes)).max(likes.length).refine(unique),
    excludedActivities: z.array(z.enum(activities)).max(activities.length).refine(unique),
    budget: z
      .object({
        currency: z.literal("CAD"),
        preferredMinCad: budget,
        preferredMaxCad: budget,
        hardMaxCad: budget.nullable(),
        explicitlyUnlimited: z.boolean(),
      })
      .strict()
      .refine(
        (b) =>
          b.preferredMinCad <= b.preferredMaxCad &&
          b.explicitlyUnlimited === (b.hardMaxCad === null) &&
          (b.hardMaxCad === null || b.hardMaxCad >= b.preferredMaxCad),
      ),
    availability: z
      .object({
        mode: z.enum(["tonight", "calendar"]),
        tonight: tonightSchema.nullable(),
        days: z.array(daySchema).max(14),
      })
      .strict(),
    origin: z
      .object({
        source: z.enum(["current_location", "manual", "group_area"]),
        label: label.nullable(),
        lat: coord.lat.nullable(),
        lng: coord.lng.nullable(),
        accuracy: z.enum(["approximate", "precise_ephemeral"]),
      })
      .strict(),
    travel: z
      .object({
        mode,
        maxOneWayMinutes: timeBudget,
        returnMode: mode.nullable(),
        alreadyAtSharedMeetingPoint: z.boolean(),
      })
      .strict(),
    accessibilityHardRequirements: tags,
    dietaryHardRequirements: tags,
    optionalNote: optionalNoteSchema,
  })
  .strict()
  .refine(
    (p) =>
      !p.excludedActivities.some((activity) => p.likedActivities.includes(activity)) &&
      (p.origin.source === "group_area"
        ? p.origin.lat === null && p.origin.lng === null && p.origin.accuracy === "approximate"
        : p.origin.lat !== null &&
          p.origin.lng !== null &&
          (p.origin.source !== "manual" || !!p.origin.label)) &&
      (p.availability.mode === "tonight"
        ? p.availability.tonight !== null && p.availability.days.length === 0
        : p.availability.tonight === null && unique(p.availability.days.map((day) => day.date))),
  );

export type MemberPreferencesV3 = z.infer<typeof memberPreferencesV3Schema>;
export type Interval = { start: number; end: number };
export function dayBounds(day: string): Interval {
  return { start: wallTime(day, "00:00"), end: wallTime(day, "06:00", 1) };
}

export function unambiguous(at: number, grid: boolean) {
  const local = Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(PLANNING_TIME_ZONE);
  if (local.second || local.millisecond || (grid && local.minute % 30 !== 0)) return false;
  try {
    return (
      local.toPlainDateTime().toZonedDateTime(PLANNING_TIME_ZONE, { disambiguation: "reject" })
        .epochMilliseconds === at
    );
  } catch {
    return false;
  }
}

export function complement(bounds: Interval, busy: Interval[]): Interval[] {
  const free: Interval[] = [];
  let cursor = bounds.start;
  for (const item of [...busy].sort((a, b) => a.start - b.start)) {
    if (item.end <= cursor || item.start >= bounds.end) continue;
    if (item.start > cursor) free.push({ start: cursor, end: item.start });
    cursor = Math.max(cursor, item.end);
  }
  if (cursor < bounds.end) free.push({ start: cursor, end: bounds.end });
  return free;
}

export function availableWindows(
  preferences: MemberPreferencesV3,
  day: string,
  now: number,
): Interval[] {
  const bounds = dayBounds(day);
  bounds.start = Math.max(now, bounds.start);
  const { tonight, days } = preferences.availability;
  if (tonight) {
    const start = Math.max(
      bounds.start,
      tonight.earliestDepartureAt ? Date.parse(tonight.earliestDepartureAt) : now,
    );
    const end = Math.min(
      bounds.end,
      tonight.latestReturnAt ? Date.parse(tonight.latestReturnAt) : bounds.end,
    );
    return start < end ? [{ start, end }] : [];
  }
  if (!days.some((d) => d.date === day && d.confirmed)) return [];
  return complement(
    bounds,
    days
      .filter((d) => d.confirmed)
      .flatMap((d) =>
        d.busyIntervals.map((item) => ({
          start: Date.parse(item.startAt),
          end: Date.parse(item.endAt),
        })),
      ),
  );
}

export function normalizePreferences(
  input: unknown,
  config: HostConfigV3,
  now: number,
  persisted = false,
): MemberPreferencesV3 {
  const parsed = memberPreferencesV3Schema.safeParse(input);
  requireValid(parsed.success);
  const p = parsed.data;
  const candidateDates = config.dateSelection.candidateDates;
  const day = candidateDates[0];
  requireValid(
    day &&
      (!p.travel.alreadyAtSharedMeetingPoint || config.travelArrangement.mode === "together") &&
      (p.origin.source !== "group_area" || (config.area.mode === "host_area" && config.area.point)),
  );
  const tonight = p.availability.tonight;
  if (tonight) {
    requireValid(config.dateSelection.mode === "today_tonight");
    const bounds = dayBounds(day);
    if (tonight.earliestDepartureAt) {
      const at = Date.parse(tonight.earliestDepartureAt);
      requireValid(unambiguous(at, false) && at >= bounds.start && at < wallTime(day, "24:00"));
    }
    if (tonight.latestReturnAt) {
      const at = Date.parse(tonight.latestReturnAt);
      const morningEnd = wallTime(day, "06:00");
      requireValid(unambiguous(at, false) && at > morningEnd && at <= bounds.end);
    }
  } else {
    requireValid(config.dateSelection.mode !== "today_tonight");
    p.availability.days.sort((a, b) => a.date.localeCompare(b.date));
    requireValid(p.availability.days.map((d) => d.date).join() === candidateDates.join());
    for (const d of p.availability.days) {
      requireValid(d.confirmed);
      const bounds = dayBounds(d.date);
      const merged: Interval[] = [];
      for (const item of d.busyIntervals
        .map((i) => ({ start: Date.parse(i.startAt), end: Date.parse(i.endAt) }))
        .sort((a, b) => a.start - b.start)) {
        const previous = merged.at(-1);
        requireValid(
          item.start >= bounds.start &&
            item.end <= bounds.end &&
            item.start < item.end &&
            unambiguous(item.start, true) &&
            unambiguous(item.end, true) &&
            (!previous || previous.end <= item.start),
        );
        if (previous?.end === item.start) previous.end = item.end;
        else merged.push(item);
      }
      d.busyIntervals = merged.map(({ start, end }) => ({
        startAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
      }));
    }
  }
  const validationNow = persisted ? Number.NEGATIVE_INFINITY : now;
  requireValid(
    candidateDates.some((candidate) =>
      availableWindows(p, candidate, validationNow).some(
        (window) => window.end - window.start >= config.duration.minMinutes * 60_000,
      ),
    ),
  );
  return p;
}

export const snapshotV3Schema = z
  .object({
    schemaVersion: z.literal(3),
    revision: z.number().int().nonnegative(),
    config: hostConfigV3Schema,
    members: z
      .array(z.object({ id: z.string().uuid(), preferences: memberPreferencesV3Schema }).strict())
      .min(2)
      .max(10),
  })
  .strict()
  .refine((snapshot) => unique(snapshot.members.map((member) => member.id)));
export type SnapshotV3 = z.infer<typeof snapshotV3Schema>;
