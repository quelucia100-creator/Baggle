import { URL } from "node:url";
import { afterAll, beforeAll, describe, vi } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// These suites create and delete database records. Only opt in with a separate, authorized project.
const enabled = process.env["PLANNING_DB_TESTS"] === "1";
const appEndpoints = [import.meta.env["VITE_SUPABASE_URL"], process.env["SUPABASE_URL"]];
export const describeIsolatedDatabase = describe.skipIf(!enabled);

export function useIsolatedSupabase() {
  const partyCodes: string[] = [];

  beforeAll(() => {
    if (!enabled) return;
    const url = process.env["PLANNING_TEST_SUPABASE_URL"];
    const publishableKey = process.env["PLANNING_TEST_SUPABASE_PUBLISHABLE_KEY"];
    const serviceRoleKey = process.env["PLANNING_TEST_SUPABASE_SERVICE_ROLE_KEY"];
    if (!url || !publishableKey || !serviceRoleKey) {
      throw new Error("Database tests require PLANNING_TEST_SUPABASE_URL, PLANNING_TEST_SUPABASE_PUBLISHABLE_KEY and PLANNING_TEST_SUPABASE_SERVICE_ROLE_KEY.");
    }
    const endpoint = URL.parse(url);
    const loopback = endpoint && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    if (!endpoint || (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && loopback)) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw new Error("Database tests require a valid isolated Supabase endpoint.");
    }
    if (appEndpoints.some((appUrl) => appUrl && URL.parse(appUrl)?.origin === endpoint.origin)) {
      throw new Error("Database tests cannot target a configured application endpoint.");
    }
    if (publishableKey === serviceRoleKey || publishableKey.startsWith("sb_secret_")) {
      throw new Error("Database tests require a separate unprivileged Supabase key.");
    }

    vi.stubEnv("VITE_SUPABASE_URL", url);
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", publishableKey);
    vi.stubEnv("SUPABASE_URL", url);
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", publishableKey);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
  });

  afterAll(async () => {
    try {
      if (partyCodes.length) {
        const cleanup = await supabaseAdmin.from("parties").delete().in("code", partyCodes);
        if (cleanup.error) throw new Error("Could not clean up database test parties.");
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  return partyCodes;
}
