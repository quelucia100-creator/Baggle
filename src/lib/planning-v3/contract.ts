/**
 * Client-safe Planning V3 contract shared with the planning UI.
 * The database remains authoritative for mutation authorization and revisions.
 */
import type { HostConfigV3, MemberPreferencesV3 } from "./schema";
import type { LegacyPlanningState, VersionedPlanningState } from "./state";

export type { HostConfigV3, MemberPreferencesV3 } from "./schema";
export { activities, hostConfigV3Schema, memberPreferencesV3Schema, modes, vibes } from "./schema";
export type { LegacyPlanningState, PlanningStateV3, VersionedPlanningState } from "./state";
export type { PlanningWarningV3, PublicPlanV3 } from "./venue";
export { publicPlanV3Schema, publicVenueV3Schema, planningWarningsV3 } from "./venue";
export { PLANNING_TIME_ZONE } from "../planning/tz";

export type PlanningCommandV3 =
  | { action: "configure"; config: HostConfigV3 }
  | { action: "save"; preferences: MemberPreferencesV3; revision: number }
  | { action: "vote" | "host_reroll" | "finalize"; revision: number }
  | { action: "read" | "lock" | "reopen" };

export type PlanningRequestV3 = PlanningCommandV3 & {
  schemaVersion: 3;
  code: string;
  token: string;
};

/** A V3 read may see a V2 party before the host's initial configure. */
export function canBootstrapPlanningV3(
  state: VersionedPlanningState,
  isHost: boolean,
): state is LegacyPlanningState {
  return isHost && state.schemaVersion === 2 && state.status === "collecting";
}

export const planningWeatherAttribution = {
  name: "Open-Meteo",
  url: "https://open-meteo.com/",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  modification: "Hourly forecast summarized for the activity window",
} as const;
