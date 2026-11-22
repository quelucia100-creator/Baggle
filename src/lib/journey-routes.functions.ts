import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

export const getJourneyRoutes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().regex(/^[A-Z0-9]{6}$/),
        token: z.string().regex(/^[a-f0-9]{64}$/),
        mode: z.enum(["WALK", "BICYCLE", "DRIVE", "TRANSIT"]),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const gatewayKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!url || !key) throw new Error("Party service is unavailable.");
    const { createClient } = await import("@supabase/supabase-js");
    const { partySchema } = await import("./party");
    const { z: validator } = await import("zod");
    const { mapPointSchema } = await import("./journey-map-model");
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
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
    // Read only through capability-verified RPCs. Never read private tables or
    // use private planning origins to draw routes for the crew.
    const membership = await client.rpc("party_journey", {
      p_action: "read",
      p_code: data.code,
      p_token: data.token,
    });
    if (membership.error) throw new Error("Join this party to view its routes.");
    const party = partySchema.parse(membership.data);
    const planning = await client.rpc("party_plan", {
      p_action: "read",
      p_code: data.code,
      p_token: data.token,
    });
    if (planning.error) throw new Error("Could not confirm the shared plan.");
    const plan = validator
      .object({
        status: validator.enum(["locked", "final"]),
        revision: validator.number().int(),
        plan: validator.object({ venue: validator.object({ location: mapPointSchema }) }),
      })
      .safeParse(planning.data);
    if (!plan.success) throw new Error("Routes are available once a shared plan is selected.");
    if (!gatewayKey || !mapsKey) throw new Error("Google Maps routes are not connected.");
    const { fetchJourneyRoutes } = await import("./journey-routes.server");
    return fetchJourneyRoutes({
      party,
      destination: plan.data.plan.venue.location,
      revision: plan.data.revision,
      mode: data.mode,
      gatewayKey,
      mapsKey,
    });
  });
