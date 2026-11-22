import { z } from "zod";

export const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const preferencesSchema = z
  .object({
    budget: z.number().int().min(0).max(4),
    freeFrom: timeSchema,
    freeTo: timeSchema,
    maxTravelMin: z.number().int().min(5).max(90),
    originLat: z.number().min(-90).max(90).nullable().default(null),
    originLng: z.number().min(-180).max(180).nullable().default(null),
  })
  .refine(
    (p) => (p.originLat === null) === (p.originLng === null),
    "Supply both rough coordinates or neither",
  );
export const configSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMin: z.number().int().min(30).max(240),
  areaLabel: z.string().trim().min(1).max(80),
  area: pointSchema,
  category: z.enum(["park", "cafe", "museum", "restaurant", "activity"]),
});
export const solverMemberSchema = z.object({
  id: z.string().uuid(),
  budget: z.number().int().min(0).max(4),
  freeFrom: timeSchema,
  freeTo: timeSchema,
  maxTravelMin: z.number().int().min(5).max(90),
  origin: pointSchema.nullable(),
});
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Most free stretches one day can hold (every other half-hour). */
export const MAX_DAY_WINDOWS = 24;
/**
 * Host-picked days a member is free on, each with one or more free stretches
 * (Montreal wall time; a stretch ending at or before its start runs past midnight).
 */
export const dayWindowsSchema = z.record(
  dateSchema,
  z
    .array(z.object({ freeFrom: timeSchema, freeTo: timeSchema }))
    .min(1)
    .max(MAX_DAY_WINDOWS),
);
export type DayWindows = z.infer<typeof dayWindowsSchema>;
/** Upper bound on the days a host can offer (today plus the following week). */
export const MAX_CANDIDATE_DATES = 7;
export const snapshotSchema = z.object({
  // `dates` lists the host's candidate days; absent or empty means `date` only.
  config: configSchema.extend({ dates: z.array(dateSchema).max(MAX_CANDIDATE_DATES).optional() }),
  members: z
    .array(solverMemberSchema.extend({ dayWindows: dayWindowsSchema.optional() }))
    .min(2)
    .max(10),
});
export type Point = z.infer<typeof pointSchema>;
export type PlanningConfig = z.infer<typeof configSchema>;
export type SolverMember = z.infer<typeof solverMemberSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type OpeningPeriod = { open: string; close: string };
export type Venue = {
  placeId: string;
  name: string;
  category: PlanningConfig["category"];
  priceTier: number | null;
  location: Point;
  hours: Record<string, OpeningPeriod[]> | null;
  outdoor: boolean;
  season: "winter" | "summer" | null;
  rating: number | null;
  mapsUrl: string;
};
export type ForecastHour = { at: string; temperature: number; precipitation: number; code: number };
export const planOptionSchema = z.object({
  venue: z.object({
    placeId: z.string(),
    name: z.string(),
    category: z.string(),
    priceTier: z.number().nullable(),
    location: pointSchema,
    mapsUrl: z.string().url(),
    outdoor: z.boolean(),
  }),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  score: z.number(),
  compromise: z.string(),
  hoursUnknown: z.boolean(),
  weather: z
    .object({ temperature: z.number(), precipitation: z.number(), code: z.number() })
    .nullable(),
});
export type PlanOption = z.infer<typeof planOptionSchema>;
export const NEUTRAL_COMPROMISE = "Review this option";

// Keep internal ranking data out of stored and client-facing plan options.
export const publicPlanOptionSchema = planOptionSchema
  .omit({ score: true })
  .extend({ compromise: z.literal(NEUTRAL_COMPROMISE) });
export type PublicPlanOption = z.infer<typeof publicPlanOptionSchema>;
export const toPublicPlanOptions = (options: PlanOption[]): PublicPlanOption[] =>
  options.map((option) =>
    publicPlanOptionSchema.parse({ ...option, compromise: NEUTRAL_COMPROMISE }),
  );
export const planningStateSchema = z.object({
  status: z.enum(["collecting", "locking", "locked", "no_plan", "final"]),
  revision: z.number().int(),
  selfPreferences: preferencesSchema.nullable(),
  members: z.array(z.object({ id: z.string().uuid(), submitted: z.boolean() })),
  config: configSchema,
  plan: publicPlanOptionSchema.nullable(),
  planIndex: z.number().int(),
  optionCount: z.number().int(),
  groupRerollsUsed: z.number().int(),
  votes: z.number().int(),
  voteThreshold: z.number().int(),
  selfVoted: z.boolean(),
  noPlanReason: z.literal("no_match").nullable(),
  venueSource: z.string().nullable(),
});
export type PlanningState = z.infer<typeof planningStateSchema>;
export const planningLockStateSchema = planningStateSchema.extend({
  acquired: z.boolean(),
  lease: z.string().uuid().nullable(),
});
export const planningRequestSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/),
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
