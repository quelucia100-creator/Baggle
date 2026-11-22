import "@tanstack/react-start/server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { snapshotSchema, toPublicPlanOptions } from "./types";
import { solvePlans } from "./solver";
import { FALLBACK_VENUES } from "./venues";
import { fetchPlanningForecast } from "./forecast.server";
import { fetchPlanningVenues } from "./places.server";
import { computeV3 } from "../planning-v3/compute.server";
import { PlanningProviderError } from "../planning-v3/routes.server";
import { normalizeConfig, normalizePreferences } from "../planning-v3/schema";
import { leaseFields, projectState } from "../planning-v3/state";

export type PlanningCommand = {
  action: "read" | "save" | "configure" | "lock" | "vote" | "host_reroll" | "finalize" | "reopen";
  code: string;
  token: string;
  payload: Json;
  schemaVersion?: 2 | 3;
};

const safeRpcErrors = new Set([
  "Only the host can manage planning.",
  "At least 2 members must submit preferences.",
  "This plan changed. Refresh and try again.",
  "Only the host can reroll now.",
  "Last option reached.",
  "Last option: there are no more plans.",
  "Submit your own preferences before locking.",
  "At least 2 members must submit before locking.",
  "Only a no-plan result can be reopened.",
]);

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
    if (result.error)
      throw new Error(
        safeRpcErrors.has(result.error.message)
          ? result.error.message
          : "The planning request could not be completed. Refresh and try again.",
      );
    return result.data;
  };
  const now = Date.now();
  const version = command.schemaVersion ?? 2;
  const read = async () => projectState(await invoke("read"), now);
  const requireVersion = (state: ReturnType<typeof projectState>, allowLegacyRead = false) => {
    if (
      state.schemaVersion !== version &&
      !(allowLegacyRead && version === 3 && state.schemaVersion === 2)
    )
      throw new Error("This party requires a compatible planning version. Refresh and try again.");
    return state;
  };
  if (command.action === "read") return requireVersion(await read(), true);
  let payload = command.payload;
  if (version === 3) {
    if (command.action === "configure") {
      payload = normalizeConfig(payload, now);
    } else if (command.action === "save") {
      const state = await read();
      if (state.schemaVersion !== 3) throw new Error("The host must enable V3 planning first.");
      const save =
        payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
      if (save?.["expectedRevision"] !== state.revision)
        throw new Error("This plan changed. Refresh and try again.");
      payload = {
        preferences: normalizePreferences(save["preferences"], state.config, now),
        expectedRevision: state.revision,
      };
    } else {
      const state = requireVersion(await read());
      const revision =
        payload && !Array.isArray(payload) && typeof payload === "object"
          ? payload["revision"]
          : undefined;
      if (
        (command.action === "finalize" ||
          command.action === "vote" ||
          command.action === "host_reroll") &&
        revision !== state.revision
      )
        throw new Error("This plan changed. Refresh and try again.");
      payload = revision === undefined ? { schemaVersion: 3 } : { schemaVersion: 3, revision };
    }
  }
  if (command.action !== "lock")
    return requireVersion(projectState(await invoke(command.action, payload), now));
  // This verifies host capability and captures the snapshot atomically before privileged access.
  const raw = await invoke("begin_lock", payload);
  const beginning = requireVersion(projectState(raw, now));
  const lock = leaseFields.safeParse(raw);
  if (!lock.success) throw new Error("Planning is temporarily unavailable.");
  if (!lock.data.lease) return beginning;
  const lease = lock.data.lease;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    const loaded = await supabaseAdmin.rpc("party_plan_snapshot", {
      p_code: command.code,
      p_lease: lease,
    });
    if (loaded.error) throw new Error("Cannot load planning snapshot.");
    if (beginning.schemaVersion === 3) {
      const options = await computeV3(loaded.data, beginning.revision, now);
      const completed = await supabaseAdmin.rpc("party_plan_complete", {
        p_code: command.code,
        p_lease: lease,
        p_options: options,
        p_source: "curated",
      });
      if (completed.error || !completed.data) throw new Error("Planning lease expired.");
    } else {
      const snapshot = snapshotSchema.parse(loaded.data);
      const [forecast, liveVenues] = await Promise.all([
        fetchPlanningForecast(snapshot.config),
        fetchPlanningVenues(snapshot.config),
      ]);
      const liveRanking = liveVenues.length ? solvePlans(snapshot, liveVenues, forecast) : null;
      const useLiveRanking = liveRanking && liveRanking.options.length > 0;
      const ranking = useLiveRanking
        ? liveRanking
        : solvePlans(snapshot, FALLBACK_VENUES, forecast);
      const completed = await supabaseAdmin.rpc("party_plan_complete", {
        p_code: command.code,
        p_lease: lease,
        p_options: toPublicPlanOptions(ranking.options),
        p_source: useLiveRanking ? "google_places" : "fallback",
      });
      if (completed.error || !completed.data) throw new Error("Planning lease expired.");
    }
  } catch (error) {
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
    if (error instanceof PlanningProviderError) throw error;
    throw new Error("Could not finish planning. Please try again; your preferences are saved.");
  }
  return requireVersion(await read());
}
