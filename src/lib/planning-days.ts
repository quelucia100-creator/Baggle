import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { membershipToken } from "./party";
import {
  dateSchema,
  dayWindowsSchema,
  MAX_CANDIDATE_DATES,
  type DayWindows,
} from "./planning/types";

/**
 * Host-first, multi-day planning beside the V2 planner (`party_plan_days` RPC):
 * the host's candidate days, this member's own per-day windows, and whether the host
 * has finished their answers (nobody else can join or answer before that).
 */
export const planningDaysSchema = z.object({
  dates: z.array(dateSchema).max(MAX_CANDIDATE_DATES),
  selfWindows: dayWindowsSchema.nullable().default(null),
  hostReady: z.boolean(),
});
export type PlanningDays = z.infer<typeof planningDaysSchema>;

type DaysCommand =
  | { action: "read" }
  /** With `dates`, the host's own windows come along and are saved atomically. */
  | { action: "configure"; dates: string[]; windows?: DayWindows }
  | { action: "save"; windows: DayWindows };

export async function runPlanningDays(code: string, command: DaysCommand): Promise<PlanningDays> {
  const { action, ...payload } = command;
  const { data, error } = await supabase.rpc("party_plan_days", {
    p_action: action,
    p_code: code,
    p_token: membershipToken(),
    p_payload: payload,
  });
  if (error) throw new Error(error.message);
  const parsed = planningDaysSchema.safeParse(data);
  if (!parsed.success) throw new Error("Planning is temporarily unavailable.");
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
