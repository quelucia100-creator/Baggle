import { z } from "zod";
import { planningStateSchema } from "../planning/types";
import { localDay } from "../planning/tz";
import {
  dayBounds,
  hostConfigV3Schema,
  memberPreferencesV3Schema,
  normalizeConfig,
} from "./schema";
import { publicPlanV3Schema } from "./venue";

const stateV3 = planningStateSchema
  .omit({ selfPreferences: true, config: true, plan: true, venueSource: true })
  .extend({
    schemaVersion: z.literal(3),
    selfPreferences: memberPreferencesV3Schema.nullable(),
    config: hostConfigV3Schema,
    plan: publicPlanV3Schema.nullable(),
    venueSource: z.literal("curated").nullable(),
  });

const responseVersion = z.object({
  schemaVersion: z.union([z.literal(2), z.literal(3)]).default(2),
});
export const leaseFields = z
  .object({ acquired: z.boolean(), lease: z.string().uuid().nullable() })
  .refine(({ acquired, lease }) => acquired === (lease !== null));

const noMatchActions = [
  "expand_dates",
  "expand_area",
  "shorten_duration",
  "review_own_preferences",
] as const;

export function projectState(raw: unknown, now: number) {
  const version = responseVersion.safeParse(raw);
  if (!version.success) throw new Error("Planning is temporarily unavailable.");
  if (version.data.schemaVersion === 2) {
    // Legacy responses during rollout may omit schemaVersion. Legacy plans never gain V3 metadata.
    const legacy = planningStateSchema.safeParse(raw);
    if (!legacy.success) throw new Error("Planning is temporarily unavailable.");
    const record = raw as {
      config?: { version?: unknown };
      selfPreferences?: { version?: unknown } | null;
      plan?: { version?: unknown } | null;
    };
    if (
      [record.config?.version, record.selfPreferences?.version, record.plan?.version].some(
        (version) => version !== undefined && version !== 2,
      )
    )
      throw new Error("Planning is temporarily unavailable.");
    return { ...legacy.data, schemaVersion: 2 as const };
  }
  try {
    const result = stateV3.parse(raw);
    const config = normalizeConfig(result.config, now, true);
    if (result.plan) {
      const { startAt, endAt, date, venue } = result.plan;
      const start = Date.parse(startAt);
      const end = Date.parse(endAt);
      const insideSearchBounds = config.dateSelection.candidateDates.some((candidate) => {
        const bounds = dayBounds(candidate);
        return start >= bounds.start && end <= bounds.end;
      });
      if (venue.source !== "curated" || localDay(start).date !== date || !insideSearchBounds)
        throw new Error();
    }
    if (
      (result.status === "locked" || result.status === "final") !== !!result.plan ||
      (result.status === "no_plan") !== (result.noPlanReason === "no_match")
    )
      throw new Error();
    return {
      ...result,
      config,
      suggestedActions: result.status === "no_plan" ? [...noMatchActions] : [],
    };
  } catch {
    throw new Error("Planning is temporarily unavailable.");
  }
}

export type PlanningStateV3 = Extract<ReturnType<typeof projectState>, { schemaVersion: 3 }>;
export type LegacyPlanningState = Extract<ReturnType<typeof projectState>, { schemaVersion: 2 }>;
export type VersionedPlanningState = ReturnType<typeof projectState>;
