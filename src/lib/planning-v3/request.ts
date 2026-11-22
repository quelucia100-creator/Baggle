import { z } from "zod";
import { configSchema, planningRequestSchema, preferencesSchema } from "../planning/types";
import { hostConfigV3Schema, InvalidPlanningInput, memberPreferencesV3Schema } from "./schema";
const v3 = z.literal(3);
const revision = z.number().int().nonnegative().safe();

const base = planningRequestSchema
  .extend({ schemaVersion: z.union([z.literal(2), v3]).optional() })
  .strict();
const command = z.discriminatedUnion("action", [
  base.extend({ action: z.literal("read") }),
  base.extend({
    action: z.literal("configure"),
    config: z.union([
      hostConfigV3Schema,
      configSchema
        .strict()
        .extend({ version: z.literal(2).optional(), area: configSchema.shape.area.strict() }),
    ]),
  }),
  base.extend({
    action: z.literal("save"),
    revision: revision.optional(),
    preferences: z.union([
      memberPreferencesV3Schema,
      preferencesSchema
        .innerType()
        .strict()
        .extend({ version: z.literal(2).optional() }),
    ]),
  }),
  base.extend({ action: z.literal("lock") }),
  base.extend({ action: z.literal("vote"), revision }),
  base.extend({ action: z.literal("host_reroll"), revision }),
  base.extend({ action: z.literal("finalize"), revision: revision.optional() }),
  base.extend({ action: z.literal("reopen") }),
]);
export type PlanningRequest = z.input<typeof command>;
export function parsePlanningRequest(input: unknown) {
  const parsed = command.safeParse(input);
  if (!parsed.success) throw new InvalidPlanningInput();
  const data = parsed.data;
  const body =
    data.action === "configure" ? data.config : data.action === "save" ? data.preferences : null;
  if (
    (data.schemaVersion === 3 && body && body.version !== 3) ||
    (data.schemaVersion === 2 && body?.version === 3) ||
    (data.action === "save" &&
      (data.preferences.version === 3) !== (data.revision !== undefined)) ||
    (data.action === "finalize" && (data.schemaVersion === 3) !== (data.revision !== undefined))
  )
    throw new InvalidPlanningInput();
  if (
    data.action === "save" &&
    data.preferences.version !== 3 &&
    (data.preferences.originLat === null) !== (data.preferences.originLng === null)
  )
    throw new InvalidPlanningInput();
  return data;
}

export function preparePlanningCommand(data: ReturnType<typeof parsePlanningRequest>) {
  const { action, code, token } = data;
  const credentials = { action, code, token };
  if (action === "configure") {
    const { config } = data;
    if (config.version === 3) return { ...credentials, schemaVersion: 3 as const, payload: config };
    const { version: _version, ...legacy } = config;
    return {
      ...credentials,
      schemaVersion: 2 as const,
      payload: { ...legacy, areaLat: legacy.area.lat, areaLng: legacy.area.lng },
    };
  }
  if (action === "save") {
    const { preferences } = data;
    if (preferences.version === 3)
      return {
        ...credentials,
        schemaVersion: 3 as const,
        payload: { preferences, expectedRevision: data.revision! },
      };
    const { version: _version, ...legacy } = preferences;
    return { ...credentials, schemaVersion: 2 as const, payload: legacy };
  }
  return {
    ...credentials,
    schemaVersion: data.schemaVersion ?? 2,
    payload: "revision" in data && data.revision !== undefined ? { revision: data.revision } : {},
  };
}
