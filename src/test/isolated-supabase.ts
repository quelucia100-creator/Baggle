import { URL } from "node:url";
import { Buffer } from "node:buffer";
import { afterAll, beforeAll, describe, vi } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// These suites create and delete database records. Only opt in with a separate, authorized project.
const enabled = process.env["PLANNING_DB_TESTS"] === "1";
const appEndpoints = [import.meta.env["VITE_SUPABASE_URL"], process.env["SUPABASE_URL"]];
// The production project also has a Lovable proxy URL. Reject its canonical Supabase host.
const appProjectRef = "nzbjnzegammowbqenwhb";
export const describeIsolatedDatabase = describe.skipIf(!enabled);

export function validateIsolatedSupabaseUrl(
  url: string,
  configuredUrls: Array<string | undefined>,
): URL {
  const endpoint = URL.parse(url);
  if (
    !endpoint ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/"
  ) {
    throw new Error("Database tests require a dedicated Supabase origin.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
  const hostedProject = /^([a-z0-9]{20})\.supabase\.co$/.exec(endpoint.hostname)?.[1];
  const local = loopback && ["http:", "https:"].includes(endpoint.protocol);
  const hosted = hostedProject && endpoint.protocol === "https:" && !endpoint.port;
  if (!local && !hosted)
    throw new Error("Database tests require a loopback or canonical Supabase project URL.");
  if (
    hostedProject === appProjectRef ||
    configuredUrls.some((configured) => {
      const appUrl = configured && URL.parse(configured);
      return (
        appUrl &&
        (appUrl.origin === endpoint.origin || (!local && appUrl.hostname === endpoint.hostname))
      );
    })
  ) {
    throw new Error("Database tests cannot target an application endpoint.");
  }
  return endpoint;
}

function isTestKey(key: string, role: "anon" | "service_role", endpoint: URL): boolean {
  const opaquePrefix = role === "anon" ? "sb_publishable_" : "sb_secret_";
  if (key.startsWith(opaquePrefix)) return key.length > opaquePrefix.length;
  const parts = key.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    const claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    const hostedRef = endpoint.hostname.endsWith(".supabase.co")
      ? endpoint.hostname.split(".")[0]
      : undefined;
    return claims?.role === role && claims?.ref === hostedRef;
  } catch {
    return false;
  }
}

export function installIsolatedSupabaseHooks() {
  const partyCodes: string[] = [];

  beforeAll(() => {
    if (!enabled) return;
    const url = process.env["PLANNING_TEST_SUPABASE_URL"];
    const publishableKey = process.env["PLANNING_TEST_SUPABASE_PUBLISHABLE_KEY"];
    const serviceRoleKey = process.env["PLANNING_TEST_SUPABASE_SERVICE_ROLE_KEY"];
    if (!url || !publishableKey || !serviceRoleKey) {
      throw new Error(
        "Database tests require PLANNING_TEST_SUPABASE_URL, PLANNING_TEST_SUPABASE_PUBLISHABLE_KEY and PLANNING_TEST_SUPABASE_SERVICE_ROLE_KEY.",
      );
    }
    const endpoint = validateIsolatedSupabaseUrl(url, appEndpoints);
    const appKeys = [
      import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
      process.env["SUPABASE_PUBLISHABLE_KEY"],
      process.env["SUPABASE_SERVICE_ROLE_KEY"],
    ];
    if (
      !isTestKey(publishableKey, "anon", endpoint) ||
      !isTestKey(serviceRoleKey, "service_role", endpoint)
    ) {
      throw new Error(
        "Database tests require an unprivileged key and a service-role key for the isolated project.",
      );
    }
    if (appKeys.includes(publishableKey) || appKeys.includes(serviceRoleKey)) {
      throw new Error("Database tests require keys separate from the configured application keys.");
    }
    const fetchTestEndpoint = globalThis.fetch.bind(globalThis);
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const target = new URL(
        typeof input === "string" ? input : "url" in input ? input.url : input.href,
      );
      if (target.origin !== endpoint.origin)
        throw new Error("Database tests may only call the authorized test origin.");
      return fetchTestEndpoint(input, { ...init, redirect: "error" });
    });

    vi.stubEnv("VITE_SUPABASE_URL", endpoint.origin);
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", publishableKey);
    vi.stubEnv("SUPABASE_URL", endpoint.origin);
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
      vi.unstubAllGlobals();
    }
  });

  return partyCodes;
}
