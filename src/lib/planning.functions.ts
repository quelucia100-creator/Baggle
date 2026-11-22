import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { configSchema, planningRequestSchema, preferencesSchema } from "./planning/types";

const requestSchema = z.discriminatedUnion("action", [
  planningRequestSchema.extend({ action: z.literal("read") }),
  planningRequestSchema.extend({ action: z.literal("save"), preferences: preferencesSchema }),
  planningRequestSchema.extend({ action: z.literal("configure"), config: configSchema }),
  planningRequestSchema.extend({ action: z.literal("lock") }),
  planningRequestSchema.extend({ action: z.literal("vote"), revision: z.number().int().min(0) }),
  planningRequestSchema.extend({ action: z.literal("host_reroll"), revision: z.number().int().min(0) }),
  planningRequestSchema.extend({ action: z.literal("finalize") }),
  planningRequestSchema.extend({ action: z.literal("reopen") }),
]);

// Guest capabilities are deliberately independent of account authentication.
// Every request is checked in the database, including when callers bypass the UI.
export const updatePartyPlanning = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { executePlanning } = await import("./planning/service.server");
    const payload = data.action === "save" ? data.preferences : data.action === "configure"
      ? { ...data.config, areaLat: data.config.area.lat, areaLng: data.config.area.lng }
      : data.action === "vote" || data.action === "host_reroll" ? { revision: data.revision } : {};
    return executePlanning({ action: data.action, code: data.code, token: data.token, payload });
  });