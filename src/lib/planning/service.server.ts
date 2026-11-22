import "@tanstack/react-start/server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  planningLockStateSchema,
  planningStateSchema,
  snapshotSchema,
  toPublicPlanOptions,
} from "./types";
import { solvePlans } from "./solver";
import { FALLBACK_VENUES } from "./venues";
import { fetchPlanningForecast } from "./forecast.server";
import { fetchPlanningVenues } from "./places.server";

export type PlanningCommand = {
  action: "read" | "save" | "configure" | "lock" | "vote" | "host_reroll" | "finalize" | "reopen";
  code: string;
  token: string;
  payload: Json;
};

export async function executePlanning(command: PlanningCommand) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Planning is temporarily unavailable.");
  const client = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: undefined,
      storageKey: `planning-${crypto.randomUUID()}`,
    },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  const invoke = async (action: string, payload: Json = {}) => {
    const result = await client.rpc("party_plan", {
      p_action: action,
      p_code: command.code,
      p_token: command.token,
      p_payload: payload,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  };
  if (command.action !== "lock")
    return planningStateSchema.parse(await invoke(command.action, command.payload));
  // This verifies host capability and captures the snapshot atomically BEFORE privileged access.
  const beginning = planningLockStateSchema.parse(await invoke("begin_lock"));
  if (!beginning.acquired || !beginning.lease) return planningStateSchema.parse(beginning);
  const lease = beginning.lease;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    const loaded = await supabaseAdmin.rpc("party_plan_snapshot", {
      p_code: command.code,
      p_lease: lease,
    });
    if (loaded.error) throw new Error("Cannot load planning snapshot.");
    const snapshot = snapshotSchema.parse(loaded.data);
    const [forecast, liveVenues] = await Promise.all([
      fetchPlanningForecast(snapshot.config),
      fetchPlanningVenues(snapshot.config),
    ]);
    const liveRanking = liveVenues.length ? solvePlans(snapshot, liveVenues, forecast) : null;
    const useLiveRanking = liveRanking && liveRanking.options.length > 0;
    const ranking = useLiveRanking ? liveRanking : solvePlans(snapshot, FALLBACK_VENUES, forecast);
    const completed = await supabaseAdmin.rpc("party_plan_complete", {
      p_code: command.code,
      p_lease: lease,
      p_options: toPublicPlanOptions(ranking.options),
      p_source: useLiveRanking ? "google_places" : "fallback",
    });
    if (completed.error || !completed.data) throw new Error("Planning lease expired.");
  } catch {
    // A stale lease cannot reset a newer job. Failures preserve submissions for retry.
    try {
      await supabaseAdmin.rpc("party_plan_complete", {
        p_code: command.code,
        p_lease: lease,
        p_failed: true,
      });
    } catch {
      // If the database is unreachable, the lease can still expire normally.
    }
    throw new Error("Could not finish planning. Please try again; your preferences are saved.");
  }
  return planningStateSchema.parse(await invoke("read"));
}
