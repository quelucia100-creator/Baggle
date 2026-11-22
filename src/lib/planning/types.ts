import { z } from "zod";

export const pointSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const preferencesSchema = z.object({
  budget: z.number().int().min(0).max(4), freeFrom: timeSchema, freeTo: timeSchema,
  maxTravelMin: z.number().int().min(5).max(90),
  originLat: z.number().min(-90).max(90).nullable().default(null),
  originLng: z.number().min(-180).max(180).nullable().default(null),
}).refine((p) => (p.originLat === null) === (p.originLng === null), "Supply both rough coordinates or neither");
export const configSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), durationMin: z.number().int().min(30).max(240),
  areaLabel: z.string().trim().min(1).max(80), area: pointSchema,
  category: z.enum(["park", "cafe", "museum", "restaurant", "activity"]),
});
export const solverMemberSchema = z.object({
  id: z.string().uuid(), budget: z.number().int().min(0).max(4), freeFrom: timeSchema, freeTo: timeSchema,
  maxTravelMin: z.number().int().min(5).max(90), origin: pointSchema.nullable(),
});
export const snapshotSchema = z.object({ config: configSchema, members: z.array(solverMemberSchema).min(2).max(10) });
export type Point = z.infer<typeof pointSchema>;
export type PlanningConfig = z.infer<typeof configSchema>;
export type SolverMember = z.infer<typeof solverMemberSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type OpeningPeriod = { open: string; close: string };
export type Venue = {
  placeId: string; name: string; category: PlanningConfig["category"]; priceTier: number | null;
  location: Point; hours: Record<string, OpeningPeriod[]> | null;
  outdoor: boolean; season: "winter" | "summer" | null; rating: number | null; mapsUrl: string;
};
export type ForecastHour = { at: string; temperature: number; precipitation: number; code: number };
export const planOptionSchema = z.object({
  venue: z.object({ placeId: z.string(), name: z.string(), category: z.string(), priceTier: z.number().nullable(),
    location: pointSchema, mapsUrl: z.string().url(), outdoor: z.boolean() }),
  startAt: z.string().datetime(), endAt: z.string().datetime(), score: z.number(),
  compromise: z.string(), hoursUnknown: z.boolean(),
  weather: z.object({ temperature: z.number(), precipitation: z.number(), code: z.number() }).nullable(),
});
export type PlanOption = z.infer<typeof planOptionSchema>;
// `score` ranks plans server-side only; in small parties it reveals a member's private limits.
export const publicPlanOptionSchema = planOptionSchema.omit({ score: true }).extend({ compromise: z.literal("Review this option") });
export type PublicPlanOption = z.infer<typeof publicPlanOptionSchema>;
export const toPublicPlanOptions = (options: PlanOption[]): PublicPlanOption[] => z.array(publicPlanOptionSchema).parse(options.map(({ score: _score, ...rest }) => ({ ...rest, compromise: "Review this option" })));
export const planningStateSchema = z.object({
  status: z.enum(["collecting", "locking", "locked", "no_plan", "final"]), revision: z.number().int(),
  selfPreferences: preferencesSchema.nullable(), members: z.array(z.object({ id: z.string().uuid(), submitted: z.boolean() })),
  config: configSchema, plan: publicPlanOptionSchema.nullable(), planIndex: z.number().int(), optionCount: z.number().int(),
  groupRerollsUsed: z.number().int(), votes: z.number().int(), voteThreshold: z.number().int(), selfVoted: z.boolean(),
  noPlanReason: z.literal("no_match").nullable(), venueSource: z.string().nullable(),
  acquired: z.boolean().optional(), lease: z.string().uuid().nullable().optional(),
});
export type PlanningState = z.infer<typeof planningStateSchema>;
export const planningRequestSchema = z.object({ code: z.string().regex(/^[A-Z0-9]{6}$/), token: z.string().regex(/^[a-f0-9]{64}$/) });