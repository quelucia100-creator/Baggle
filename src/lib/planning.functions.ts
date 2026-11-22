import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { parsePlanningRequest } from "./planning-v3/request";
import type { PlanningRequest } from "./planning-v3/request";
import type { LegacyPlanningState, VersionedPlanningState } from "./planning-v3/state";
import type { PlanningConfig } from "./planning/types";
import type { HostConfigV3, MemberPreferencesV3 } from "./planning-v3/schema";
import type { z } from "zod";
import type { preferencesSchema } from "./planning/types";

const server = createServerFn({ method: "POST" })
  .validator((input: unknown) => parsePlanningRequest(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { executePlanning } = await import("./planning/service.server");
    const { action, code, token } = data;
    let schemaVersion: 2 | 3 = data.schemaVersion ?? 2;
    if (data.action === "save" && data.preferences.version === 3) schemaVersion = 3;
    if (data.action === "configure" && data.config.version === 3) schemaVersion = 3;
    const payload =
      data.action === "save"
        ? data.preferences
        : data.action === "configure"
          ? data.config.version === 3
            ? data.config
            : { ...data.config, areaLat: data.config.area.lat, areaLng: data.config.area.lng }
          : "revision" in data && data.revision !== undefined
            ? { revision: data.revision }
            : {};
    return executePlanning({ action, code, token, payload, schemaVersion });
  });

type Credentials = Pick<PlanningRequest, "code" | "token">;
type LegacyRequest = Credentials & { schemaVersion?: 2 } & (
    | { action: "configure"; config: PlanningConfig }
    | { action: "save"; preferences: z.input<typeof preferencesSchema> }
    | { action: "vote" | "host_reroll"; revision: number }
    | { action: "read" | "lock" | "finalize" | "reopen" }
  );
type Version3Request = Credentials & { schemaVersion: 3 } & (
    | { action: "configure"; config: HostConfigV3 }
    | { action: "save"; preferences: MemberPreferencesV3 }
    | { action: "vote" | "host_reroll" | "finalize"; revision: number }
    | { action: "read" | "lock" | "reopen" }
  );
type Call<Request, Response> = (options: {
  data: Request;
  signal?: AbortSignal;
}) => Promise<Response>;

// Both exports call the same POST endpoint. The V2 view preserves the existing UI typing.
export const updatePartyPlanning = server as Call<PlanningRequest, VersionedPlanningState> &
  Call<LegacyRequest, LegacyPlanningState>;
export const updatePartyPlanningV3 = server as Call<Version3Request, VersionedPlanningState>;
