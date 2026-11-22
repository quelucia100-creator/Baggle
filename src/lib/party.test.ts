import { beforeAll, describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { describeIsolatedDatabase, installIsolatedSupabaseHooks } from "@/test/isolated-supabase";
import { partySchema, LOCATION_RADIUS_METRES } from "./party";

describe("Guest party settings", () => {
  it("uses a zero-metre location radius", () => {
    expect(LOCATION_RADIUS_METRES).toBe(0);
  });
});

// Exercise the real guest endpoint: permissions and capacity must hold even
// when callers bypass the interface. Credentials are never printed.
describeIsolatedDatabase("Guest party access rules", { sequential: true }, () => {
  const ownedParties = installIsolatedSupabaseHooks();
  const tokens: string[] = [];
  let code = "";
  let hostId = "";
  let guestId = "";
  const rpc = (action: string, token: string, member?: string) =>
    supabase.rpc("party_access", {
      p_action: action,
      p_code: code,
      p_token: token,
      p_name: "Party verification",
      ...(member ? { p_member: member } : {}),
    });
  beforeAll(async () => {
    for (let i = 0; i < 11; i++)
      tokens.push(
        Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join(""),
      );
    const host = tokens[0];
    if (!host) throw new Error("Missing test credential");
    const result = await rpc("create", host);
    if (result.error) throw new Error(result.error.message);
    const party = partySchema.parse(result.data);
    code = party.code;
    ownedParties.push(code);
    hostId = party.selfId;
    for (const token of tokens.slice(1, 10)) {
      const joined = await rpc("join", token);
      if (joined.error) throw new Error(joined.error.message);
      guestId = partySchema.parse(joined.data).selfId;
    }
  }, 30000);
  it("allows 10 people including the host, but rejects an 11th", async () => {
    const host = tokens[0];
    const extra = tokens[10];
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
  it("only lets the host start the journey", async () => {
    const host = tokens[0];
    const guest = tokens[1];
    if (!host || !guest) throw new Error("Missing test credentials");
    const journey = (action: string, token: string) =>
      supabase.rpc("party_journey", { p_action: action, p_code: code, p_token: token });
    expect((await journey("start", guest)).error?.message).toContain("Only the host");
    expect(partySchema.parse((await journey("start", host)).data).started).toBe(true);
    expect(partySchema.parse((await journey("read", guest)).data).started).toBe(true);
  });
  it("keeps members on the map when the host returns to team status", async () => {
    const host = tokens[0];
    const guest = tokens[1];
    if (!host || !guest) throw new Error("Missing test credentials");
    const journey = (action: string, token: string) =>
      supabase.rpc("party_journey", { p_action: action, p_code: code, p_token: token });
    const hostState = partySchema.parse((await journey("team", host)).data);
    expect(hostState.view).toBe("team");
    expect(hostState.started).toBe(true);
    expect(partySchema.parse((await journey("read", guest)).data).view).toBe("map");
  });
  it("lets members return independently without host permissions", async () => {
    const host = tokens[0];
    const guest = tokens[1];
    if (!host || !guest) throw new Error("Missing test credentials");
    const journey = (action: string, token: string) =>
      supabase.rpc("party_journey", { p_action: action, p_code: code, p_token: token });
    expect(partySchema.parse((await journey("map", host)).data).view).toBe("map");
    const guestState = partySchema.parse((await journey("team", guest)).data);
    expect(guestState.view).toBe("team");
    expect(guestState.isHost).toBe(false);
    expect(partySchema.parse((await journey("read", host)).data).view).toBe("map");
    expect((await journey("start", guest)).error?.message).toContain("Only the host");
    expect(partySchema.parse((await journey("map", guest)).data).view).toBe("map");
  });
  it("shares and refreshes only the caller's location and lets them stop sharing", async () => {
    const guest = tokens[1];
    if (!guest) throw new Error("Missing test credential");
    const update = await supabase.rpc("party_journey", {
      p_action: "location",
      p_code: code,
      p_token: guest,
      p_member: hostId,
      p_lat: 43.65,
      p_lng: -79.38,
    });
    const state = partySchema.parse(update.data);
    expect(state.members.find((member) => member.id === state.selfId)?.location?.lat).toBe(43.65);
    expect(state.members.find((member) => member.id === hostId)?.location).toBeNull();
    const refreshed = await supabase.rpc("party_journey", {
      p_action: "location",
      p_code: code,
      p_token: guest,
      p_lat: 43.66,
      p_lng: -79.39,
    });
    expect(
      partySchema.parse(refreshed.data).members.find((member) => member.id === state.selfId)
        ?.location?.lat,
    ).toBe(43.66);
    const cleared = await supabase.rpc("party_journey", {
      p_action: "clear_location",
      p_code: code,
      p_token: guest,
    });
    expect(
      partySchema.parse(cleared.data).members.find((member) => member.id === state.selfId)
        ?.location,
    ).toBeNull();
  });
  it("only lets the host decide the hangout pin", async () => {
    const host = tokens[0];
    const guest = tokens[1];
    if (!host || !guest) throw new Error("Missing test credentials");
    const args = {
      p_action: "hangout",
      p_code: code,
      p_name: "Campus meetup",
      p_lat: 43.65,
      p_lng: -79.38,
    };
    expect(
      (await supabase.rpc("party_journey", { ...args, p_token: guest })).error?.message,
    ).toContain("Only the host");
    const chosen = await supabase.rpc("party_journey", { ...args, p_token: host });
    expect(partySchema.parse(chosen.data).hangout).toEqual({
      name: "Campus meetup",
      lat: 43.65,
      lng: -79.38,
    });
  });
  it("lets the host remove a guest and revokes that guest's access", async () => {
    const host = tokens[0];
    const guest = tokens[9];
    if (!host || !guest) throw new Error("Missing test credentials");
    const result = await rpc("remove", host, guestId);
    expect(result.error).toBeNull();
    expect(partySchema.parse(result.data).members).toHaveLength(9);
    expect((await rpc("read", guest)).error?.message).toContain("removed from this party");
  });
});
