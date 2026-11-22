import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { parsePlanningRequest, preparePlanningCommand } from "./planning-v3/request";
import type { PlanningRequest } from "./planning-v3/request";
import type { LegacyPlanningState, VersionedPlanningState } from "./planning-v3/state";
import type { PlanningConfig } from "./planning/types";
import type { PlanningRequestV3 } from "./planning-v3/contract";
import type { z } from "zod";
import type { preferencesSchema } from "./planning/types";

// Export the canonical builder directly so endpoint discovery never depends
// on the typed V2/V3 aliases below. Keep its name stable for open clients.
export const server = createServerFn({ method: "POST" })
  .validator((input: unknown) => parsePlanningRequest(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { executePlanning } = await import("./planning/service.server");
    return executePlanning(preparePlanningCommand(data));
  });

type Credentials = Pick<PlanningRequest, "code" | "token">;
type LegacyRequest = Credentials & { schemaVersion?: 2 } & (
    | { action: "configure"; config: PlanningConfig }
    | { action: "save"; preferences: z.input<typeof preferencesSchema> }
    | { action: "vote" | "host_reroll"; revision: number }
    | { action: "read" | "lock" | "finalize" | "reopen" }
  );
type Call<Request, Response> = (options: {
  data: Request;
  signal?: AbortSignal;
}) => Promise<Response>;

// Both exports call the same POST endpoint. The V2 view preserves the existing UI typing.
export const updatePartyPlanning = server as Call<PlanningRequest, VersionedPlanningState> &
  Call<LegacyRequest, LegacyPlanningState>;
export const updatePartyPlanningV3 = server as Call<PlanningRequestV3, VersionedPlanningState>;
