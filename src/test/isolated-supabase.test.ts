import { describe, expect, it } from "vitest";
import { validateIsolatedSupabaseUrl } from "./isolated-supabase";

describe("Isolated database URL preflight", () => {
  it.each(["http://127.0.0.1:54321", "https://abcdefghijklmnopqrst.supabase.co"])(
    "accepts the explicit test origin %s",
    (url) => expect(validateIsolatedSupabaseUrl(url, []).origin).toBe(url),
  );

  it.each([
    "https://nzbjnzegammowbqenwhb.supabase.co",
    "https://abcdefghijklmnopqrst.supabase.co",
    "https://test.lovable.cloud",
    "http://abcdefghijklmnopqrst.supabase.co",
    "https://abcdefghijklmnopqrst.supabase.co/rest/v1",
    "https://user@abcdefghijklmnopqrst.supabase.co",
    "https://abcdefghijklmnopqrst.supabase.co.example.invalid",
    "https://abcdefghijklmnopqrst.supabase.co:8443",
    "http://127.0.0.1:54320",
    "not a URL",
  ])("rejects an unsafe or configured application URL %s", (url) => {
    const configured = ["https://abcdefghijklmnopqrst.supabase.co", "http://127.0.0.1:54320"];
    expect(() => validateIsolatedSupabaseUrl(url, configured)).toThrow();
  });
});
