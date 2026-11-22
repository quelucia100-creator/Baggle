import { membershipToken } from "./party";
import { updatePartyPlanning } from "./planning.functions";
import type { PlanningCommand } from "@/components/planning/model";
import type { PlanningState } from "./planning/types";

type LegacyRequest = (PlanningCommand | { action: "read" }) & {
  code: string;
  token: string;
  schemaVersion: 2;
};
// The server function also accepts V3; the wizard always talks to the original (V2) planner.
const legacyPlanning = updatePartyPlanning as (options: {
  data: LegacyRequest;
}) => Promise<PlanningState>;

export const planningKey = (code: string) => ["party-planning", code] as const;

export function runPlanning(code: string, command: PlanningCommand): Promise<PlanningState> {
  return legacyPlanning({ data: { ...command, code, token: membershipToken(), schemaVersion: 2 } });
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
export const draftStorageKey = (code: string, memberId: string) => `baggle-plan-draft-${code}-${memberId}`;
export const vibeStorageKey = (code: string) => `baggle-plan-vibe-${code}`;
