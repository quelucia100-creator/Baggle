// Source: Google Maps Platform Code Assist
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { partySchema } from "./party";
import { summarizeWeather, WEATHER_CACHE_MS } from "./weather";

export const getPartyWeather = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: z.string().regex(/^[A-Z0-9]{6}$/), token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(input))
  .handler(async ({ data }) => {
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
    if (!url || !key) throw new Error("Party service is unavailable.");
    const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
      const h = new Headers(init?.headers);
      if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
      h.set("apikey", key);
      return fetch(input, { ...init, headers: h });
    } } });
    const verified = await client.rpc("party_journey", { p_action: "read", p_code: data.code, p_token: data.token });
    if (verified.error) throw new Error("Join this party to view its weather.");
    const party = partySchema.parse(verified.data);
    if (!party.started) throw new Error("Start the journey to view weather.");
    const point = party.hangout ?? party.members.find((member) => member.location)?.location;
    if (!point) return null;
    // Membership is validated before privileged access to the private shared cache.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cached = await supabaseAdmin.from("parties").select("weather_cache,weather_cached_at,weather_key").eq("code", data.code).single();
    if (cached.error) throw new Error("Could not read party weather.");
    const cacheKey = `${point.lat.toFixed(2)},${point.lng.toFixed(2)}`;
    if (cached.data.weather_key === cacheKey && cached.data.weather_cached_at && Date.now() - Date.parse(cached.data.weather_cached_at) < WEATHER_CACHE_MS) {
      return cached.data.weather_cache as ReturnType<typeof summarizeWeather> | null;
    }
    const gatewayKey = process.env['LOVABLE_API_KEY'];
    const mapsKey = process.env['GOOGLE_MAPS_API_KEY'];
    if (!gatewayKey || !mapsKey) throw new Error("Google Maps weather is not connected.");
    const params = new URLSearchParams({ "location.latitude": String(point.lat), "location.longitude": String(point.lng), unitsSystem: "METRIC" });
    const response = await fetch(`https://connector-gateway.lovable.dev/google_maps/weather/v1/currentConditions:lookup?${params}`, { headers: { Authorization: `Bearer ${gatewayKey}`, "X-Connection-Api-Key": mapsKey, "X-Goog-Maps-Solution-ID": "gmp_lovable_agentskills_v1" } });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Weather provider failed [${response.status}]: ${body}`);
      if (response.status === 403) {
        let reason = "";
        try { const failure = JSON.parse(body) as { error?: { details?: Array<{ reason?: string }> } }; reason = failure.error?.details?.find((item) => item.reason)?.reason ?? ""; } catch { /* Keep the provider's failure text below. */ }
        if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") throw new Error("Google Maps weather server key is referrer-restricted. Set its application restrictions to None or IP addresses in Google Cloud Console.");
        if (reason === "API_KEY_SERVICE_BLOCKED") throw new Error("Google Maps server key does not allow Weather API. Add Weather API to its allowed APIs in Google Cloud Console.");
        throw new Error(`Google Maps weather was denied (403). Check the server key restrictions. ${body}`);
      }
      throw new Error(`Weather unavailable [${response.status}]: ${body}`);
    }
    const weather = summarizeWeather(await response.json());
    const saved = await supabaseAdmin.from("parties").update({ weather_cache: weather, weather_cached_at: new Date().toISOString(), weather_key: cacheKey }).eq("code", data.code);
    if (saved.error) throw new Error("Could not save party weather.");
    return weather;
  });