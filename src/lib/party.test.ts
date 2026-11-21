import { beforeAll, describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { partySchema } from "./party";

// Exercise the real guest endpoint: permissions and capacity must hold even
// when callers bypass the interface. Credentials are never printed.
describe("Guest party access rules", () => {
  const tokens: string[] = [];
  let code = "";
  let hostId = "";
  let guestId = "";
  const rpc = (action: string, token: string, member?: string) => supabase.rpc("party_access", {
    p_action: action, p_code: code, p_token: token, p_name: "Party verification",
    ...(member ? { p_member: member } : {}),
  });
  beforeAll(async () => {
    for (let i = 0; i < 11; i++) tokens.push(Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, "0")).join(""));
    const host = tokens[0];
    if (!host) throw new Error("Missing test credential");
    const result = await rpc("create", host);
    if (result.error) throw new Error(result.error.message);
    const party = partySchema.parse(result.data);
    code = party.code;
    hostId = party.selfId;
    for (const token of tokens.slice(1, 10)) {
      const joined = await rpc("join", token);
      if (joined.error) throw new Error(joined.error.message);
      guestId = partySchema.parse(joined.data).selfId;
    }
  }, 30000);
  it("allows 10 people including the host, but rejects an 11th", async () => {
    const host = tokens[0]; const extra = tokens[10];
    if (!host || !extra) throw new Error("Missing test credentials");
    expect(partySchema.parse((await rpc("read", host)).data).members).toHaveLength(10);
    expect((await rpc("join", extra)).error?.message).toContain("10 people maximum");
  });
  it("rejects member removal by a non-host", async () => {
    const guest = tokens[1];
    if (!guest) throw new Error("Missing test credential");
    expect((await rpc("remove", guest, guestId)).error?.message).toContain("Only the host");
  });
  it("does not allow removing the host", async () => {
    const host = tokens[0];
    if (!host) throw new Error("Missing test credential");
    expect((await rpc("remove", host, hostId)).error?.message).toContain("host cannot be removed");
  });
  it("lets the host remove a guest and revokes that guest's access", async () => {
    const host = tokens[0]; const guest = tokens[9];
    if (!host || !guest) throw new Error("Missing test credentials");
    const result = await rpc("remove", host, guestId);
    expect(result.error).toBeNull();
    expect(partySchema.parse(result.data).members).toHaveLength(9);
    expect((await rpc("read", guest)).error?.message).toContain("removed from this party");
  });
});