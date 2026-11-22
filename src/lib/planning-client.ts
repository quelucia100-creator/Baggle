import { queryOptions } from "@tanstack/react-query";
import { membershipToken } from "./party";
import { updatePartyPlanning } from "./planning.functions";
import type { PlanningCommand } from "@/components/planning/model";
import type { PlanningState } from "./planning/types";

export const planningKey = (code: string) => ["party-planning", code] as const;

// The capability token is browser-only input to the RPC; it never goes into keys or URLs.
export function planningQuery(code: string) {
  return queryOptions({
    queryKey: planningKey(code),
    queryFn: (): Promise<PlanningState> =>
      updatePartyPlanning({ data: { action: "read", code, token: membershipToken() } }),
    refetchInterval: 3000,
    retry: false,
    // selfPreferences are private: drop them from memory once no screen uses them.
    gcTime: 0,
  });
}

export function runPlanning(code: string, command: PlanningCommand): Promise<PlanningState> {
  return updatePartyPlanning({ data: { ...command, code, token: membershipToken() } });
}

/** Browser storage is optional (private mode, quotas). Never let it break the flow. */
export function readStored(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
export function writeStored(storage: "local" | "session", key: string, value: string | null) {
  try {
    const target = storage === "local" ? localStorage : sessionStorage;
    if (value === null) target.removeItem(key);
    else target.setItem(key, value);
  } catch {
    // Storage unavailable: the draft simply isn't kept across reloads.
  }
}
export const draftStorageKey = (code: string) => `baggle-plan-draft-${code}`;
export const vibeStorageKey = (code: string) => `baggle-plan-vibe-${code}`;
