import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { membershipToken } from "./party";
import type { Json } from "@/integrations/supabase/types";
import {
  dateSchema,
  dayWindowsSchema,
  MAX_CANDIDATE_DATES,
  type PlanningConfig,
  preferencesSchema,
  type DayWindows,
} from "./planning/types";

/**
 * Host-first, multi-day planning beside the V2 planner (`party_plan_days` RPC):
 * the host's candidate days, this member's own per-day windows, and whether the host
 * has finished their answers (nobody else can join or answer before that).
 */
export const planningDaysSchema = z
  .object({
    dates: z.array(dateSchema).max(14),
    selfWindows: dayWindowsSchema.nullable().default(null),
    hostReady: z.boolean(),
    phase: z
      .enum([
        "HOST_SETUP_PENDING",
        "HOST_READY",
        "COLLECTING_GUEST_PREFERENCES",
        "LOCKING",
        "RESULT",
        "NO_MATCH",
        "FINAL",
      ])
      .optional(),
    schemaVersion: z.union([z.literal(2), z.literal(3)]).optional(),
    revision: z.number().int().nonnegative().optional(),
  })
  .refine(({ dates, schemaVersion }) => schemaVersion === 3 || dates.length <= MAX_CANDIDATE_DATES);
export type PlanningDays = z.infer<typeof planningDaysSchema>;

type DayAnswers = {
  expectedRevision: number;
  windows: DayWindows;
  preferences: z.infer<typeof preferencesSchema>;
};
type DaysCommand =
  | { action: "read" }
  | ({ action: "configure"; dates: string[]; category: PlanningConfig["category"] } & DayAnswers)
  | ({ action: "save" } & DayAnswers);

/** Optional rollout contract: generated types always describe the installed schema, not a pending migration. */
type OptionalDaysRpc = (
  name: "party_plan_days",
  args: {
    p_action: DaysCommand["action"];
    p_code: string;
    p_token: string;
    p_payload: Json;
  },
) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;

export class PlanningDaysUnavailable extends Error {
  constructor() {
    super("Multi-day planning is not installed yet.");
  }
}
export const isPlanningDaysUnavailable = (error: unknown): error is PlanningDaysUnavailable =>
  error instanceof PlanningDaysUnavailable;

export async function runPlanningDays(code: string, command: DaysCommand): Promise<PlanningDays> {
  const { action, ...payload } = command;
  const rpc = supabase.rpc.bind(supabase) as unknown as OptionalDaysRpc;
  const { data, error } = await rpc("party_plan_days", {
    p_action: action,
    p_code: code,
    p_token: membershipToken(),
    p_payload: payload,
  });
  if (error?.code === "PGRST202" && error.message.includes("party_plan_days"))
    throw new PlanningDaysUnavailable();
  if (error) throw new Error(error.message);
  const parsed = planningDaysSchema.safeParse(data);
  if (!parsed.success || (action !== "read" && parsed.data.revision === undefined))
    throw new Error("Planning is temporarily unavailable.");

  return parsed.data;
}

export const planningDaysKey = (code: string) => ["party-planning-days", code] as const;

// selfWindows are private: never in URLs or storage, and dropped once no screen uses them.
export function planningDaysQuery(code: string) {
  return queryOptions({
    queryKey: planningDaysKey(code),
    queryFn: () => runPlanningDays(code, { action: "read" }),
    refetchInterval: 3000,
    retry: false,
    gcTime: 0,
  });
}

/** Shown when someone tries to join before the host has finished (raised by the database). */
export const HOST_SETTING_UP = "The host is still setting up this hangout.";
