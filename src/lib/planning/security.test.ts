import { beforeAll, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { describeIsolatedDatabase, useIsolatedSupabase } from "@/test/isolated-supabase";
import { partySchema } from "../party";
import { executePlanning } from "./service.server";
import { planningStateSchema } from "./types";
import { montrealToday } from "./tz";
import type { Json } from "@/integrations/supabase/types";

vi.mock("./forecast.server", () => ({ fetchPlanningForecast: vi.fn(async () => []) }));
vi.mock("./places.server", () => ({ fetchPlanningVenues: vi.fn(async () => []) }));
const credential = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, "0")).join("");
const ownedParties = useIsolatedSupabase();
async function newParty(count: number) {
  const tokens = Array.from({ length: count }, credential); const host = tokens[0];
  if (!host) throw new Error("Missing test host");
  const created = await supabase.rpc("party_access", { p_action: "create", p_code: "", p_token: host, p_name: "Planning test host" });
  if (created.error) throw new Error(created.error.message);
  const party = partySchema.parse(created.data); ownedParties.push(party.code);
  const ids = [party.selfId];
  for (const token of tokens.slice(1)) {
    const joined = await supabase.rpc("party_access", { p_action: "join", p_code: party.code, p_token: token, p_name: "Planning test guest" });
    if (joined.error) throw new Error(joined.error.message); ids.push(partySchema.parse(joined.data).selfId);
  }
  return { code: party.code, tokens, ids, host };
}
const prefs = { budget: 0, freeFrom: "18:00", freeTo: "23:00", maxTravelMin: 30, originLat: null, originLng: null };
async function call(code: string, token: string, action: string, payload: Json = {}) {
  return supabase.rpc("party_plan", { p_code: code, p_token: token, p_action: action, p_payload: payload });
}
describeIsolatedDatabase("Real database planning security and lifecycle", { sequential: true }, () => {
  let party: Awaited<ReturnType<typeof newParty>>; let guest = ""; let other = "";
  beforeAll(async () => {
    party = await newParty(5); guest = party.tokens[1] ?? ""; other = party.tokens[2] ?? "";
    if (!guest || !other) throw new Error("Missing test guests");
  }, 30000);
  it("requires a valid active capability, not just a known party code", async () => {
    expect((await call(party.code, credential(), "read")).error?.message).toContain("Join this party");
    expect((await call(party.code, "invalid", "read")).error?.message).toContain("Invalid membership credential");
  });
  it("denies direct access to every private planning table and service RPC", async () => {
    for (const table of ["party_preferences", "party_planning", "party_reroll_votes"] as const) {
      expect((await supabase.from(table).select("*")).error).not.toBeNull();
    }
    expect((await supabase.rpc("party_plan_snapshot", { p_code: party.code, p_lease: crypto.randomUUID() })).error).not.toBeNull();
    expect((await supabase.rpc("party_plan_complete", { p_code: party.code, p_lease: crypto.randomUUID() })).error).not.toBeNull();
  });
  it("enforces host-only configuration, lock, reroll, finalization, and reopening", async () => {
    for (const action of ["configure", "begin_lock", "host_reroll", "finalize", "reopen"]) {
      expect((await call(party.code, guest, action)).error?.message).toContain("Only the host");
    }
  });
  it("requires two submitted members before the host can lock", async () => {
    await call(party.code, party.host, "save", prefs);
    expect((await call(party.code, party.host, "begin_lock")).error?.message).toContain("At least 2 members");
  });
  it("stores only caller preferences and publishes only readiness, including to the host", async () => {
    const result = await call(party.code, guest, "save", { ...prefs, budget: 3, originLat: 45.512345, originLng: -73.578901, memberId: party.ids[0] });
    expect(result.error).toBeNull();
    const guestState = planningStateSchema.parse(result.data);
    expect(guestState.selfPreferences?.budget).toBe(3); expect(guestState.selfPreferences?.originLat).toBe(45.51);
    const hostRead = await call(party.code, party.host, "read");
    expect(hostRead.error).toBeNull();
    const hostState = planningStateSchema.parse(hostRead.data);
    expect(hostState.selfPreferences?.budget).toBe(0);
    expect(hostState.members.filter((m) => m.submitted)).toHaveLength(2);
    expect((hostRead.data as { members?: unknown } | null)?.members).toStrictEqual(hostState.members);
    expect(hostRead.data).not.toHaveProperty("lockSnapshot");
    expect(JSON.stringify(hostRead.data)).not.toContain("45.51");
    const otherRead = await call(party.code, other, "read");
    expect(otherRead.error).toBeNull();
    expect(otherRead.data).toHaveProperty("selfPreferences", null);
    expect(otherRead.data).not.toHaveProperty("lockSnapshot");
  });
  it("rejects invalid budget, travel, incomplete preferences and coordinate pairs", async () => {
    for (const invalid of [{ ...prefs, budget: 5 }, { ...prefs, maxTravelMin: 4 }, { ...prefs, maxTravelMin: 91 }, { ...prefs, originLat: 45.5 }, { ...prefs, freeFrom: "25:00" }, { budget: 0 }]) {
      expect((await call(party.code, other, "save", invalid)).error).not.toBeNull();
    }
  });
  it("allows exactly one concurrent lock computation and stores one ranking", async () => {
    for (const token of party.tokens.slice(2, 4)) await call(party.code, token, "save", prefs);
    const { fetchPlanningForecast } = await import("./forecast.server"); vi.mocked(fetchPlanningForecast).mockClear();
    const results = await Promise.all([executePlanning({ action: "lock", code: party.code, token: party.host, payload: {} }), executePlanning({ action: "lock", code: party.code, token: party.host, payload: {} })]);
    expect(fetchPlanningForecast).toHaveBeenCalledTimes(1);
    expect(results.every((r) => ["locking", "locked"].includes(r.status))).toBe(true);
    const raw = (await call(party.code, guest, "read")).data as { plan?: Record<string, unknown> } | null;
    expect(raw?.plan).toEqual(expect.objectContaining({ venue: expect.any(Object) }));
    expect(raw?.plan).not.toHaveProperty("score");
    const saved = planningStateSchema.parse(raw);
    expect(saved.status).toBe("locked"); expect(saved.optionCount).toBe(20); expect(saved.plan?.venue.priceTier).toBe(0);
    expect(saved.selfPreferences?.originLat).toBeNull(); expect(saved).not.toHaveProperty("outlierNames");
    expect((await call(party.code, guest, "save", prefs)).error?.message).toContain("frozen");
  });
  it("rejects unsubmitted votes, stale revisions, and counts duplicates only once", async () => {
    const state = planningStateSchema.parse((await call(party.code, guest, "read")).data);
    const late = party.tokens[4]; if (!late) throw new Error("Missing late member");
    expect((await call(party.code, late, "vote", { revision: state.revision })).error?.message).toContain("Submit preferences");
    expect((await call(party.code, guest, "vote", { revision: state.revision - 1 })).error?.message).toContain("plan changed");
    await call(party.code, guest, "vote", { revision: state.revision });
    const repeated = planningStateSchema.parse((await call(party.code, guest, "vote", { revision: state.revision })).data);
    expect(repeated.votes).toBe(1); expect(repeated.voteThreshold).toBe(2); expect(repeated.planIndex).toBe(0);
  });
  it("advances at ceil(submitted/2), shares exactly three rerolls, then permits host-only unlimited rerolls", async () => {
    let state = planningStateSchema.parse((await call(party.code, party.host, "read")).data);
    state = planningStateSchema.parse((await call(party.code, other, "vote", { revision: state.revision })).data);
    expect(state.planIndex).toBe(1); expect(state.groupRerollsUsed).toBe(1); expect(state.votes).toBe(0);
    for (let round = 1; round < 3; round++) {
      await call(party.code, guest, "vote", { revision: state.revision });
      state = planningStateSchema.parse((await call(party.code, other, "vote", { revision: state.revision })).data);
    }
    expect(state.groupRerollsUsed).toBe(3); expect(state.planIndex).toBe(3);
    expect((await call(party.code, guest, "vote", { revision: state.revision })).error?.message).toContain("Only the host");
    for (let i = 0; i < 5; i++) state = planningStateSchema.parse((await call(party.code, party.host, "host_reroll", { revision: state.revision })).data);
    expect(state.planIndex).toBe(8); expect(state.groupRerollsUsed).toBe(3);
  });
  it("stops at the last option and finalizes idempotently without allowing more votes", async () => {
    let state = planningStateSchema.parse((await call(party.code, party.host, "read")).data);
    while (state.planIndex < state.optionCount - 1) state = planningStateSchema.parse((await call(party.code, party.host, "host_reroll", { revision: state.revision })).data);
    expect((await call(party.code, party.host, "host_reroll", { revision: state.revision })).error?.message).toContain("Last option");
    expect(planningStateSchema.parse((await call(party.code, party.host, "finalize")).data).status).toBe("final");
    expect(planningStateSchema.parse((await call(party.code, party.host, "finalize")).data).status).toBe("final");
    expect((await call(party.code, guest, "vote", { revision: state.revision })).error?.message).toContain("no open plan");
    expect((await call(party.code, party.host, "reopen")).error?.message).toContain("Only a no-plan");
  });
  it("revokes planning access when an existing host removes a member", async () => {
    const removed = await supabase.rpc("party_access", { p_action: "remove", p_code: party.code, p_token: party.host, p_member: party.ids[1] ?? crypto.randomUUID() });
    expect(removed.error).toBeNull(); expect((await call(party.code, guest, "read")).error?.message).toContain("removed");
  });
});

describeIsolatedDatabase("Real database no-plan recovery and lock leases", () => {
  it("restores collecting after pipeline failure and supports a successful retry", async () => {
    const party = await newParty(2); const guest = party.tokens[1]; if (!guest) throw new Error("Missing member");
    await call(party.code, party.host, "save", prefs); await call(party.code, guest, "save", prefs);
    const { fetchPlanningForecast } = await import("./forecast.server");
    vi.mocked(fetchPlanningForecast).mockRejectedValueOnce(new Error("Simulated pipeline failure"));
    await expect(executePlanning({ action: "lock", code: party.code, token: party.host, payload: {} })).rejects.toThrow("preferences are saved");
    const retryable = planningStateSchema.parse((await call(party.code, guest, "read")).data);
    expect(retryable.status).toBe("collecting"); expect(retryable.members.filter((m) => m.submitted)).toHaveLength(2);
    expect((await executePlanning({ action: "lock", code: party.code, token: party.host, payload: {} })).status).toBe("locked");
  });
  it("shows outlier names only to host and reopens without losing submissions", async () => {
    const party = await newParty(3); const guest = party.tokens[1]; const other = party.tokens[2]; if (!guest || !other) throw new Error("Missing test member");
    await call(party.code, party.host, "save", prefs); await call(party.code, guest, "save", prefs);
    await call(party.code, other, "save", { ...prefs, freeFrom: "08:00", freeTo: "10:00" });
    const locked = await executePlanning({ action: "lock", code: party.code, token: party.host, payload: {} });
    expect(locked.status).toBe("no_plan"); expect(locked.outlierNames).toHaveLength(1);
    const guestState = planningStateSchema.parse((await call(party.code, guest, "read")).data);
    expect(guestState.outlierCount).toBe(1); expect(guestState).not.toHaveProperty("outlierNames");
    const reopened = planningStateSchema.parse((await call(party.code, party.host, "reopen")).data);
    expect(reopened.status).toBe("collecting"); expect(reopened.members.filter((m) => m.submitted)).toHaveLength(3);
    expect((await call(party.code, other, "save", prefs)).error).toBeNull();
  });
  it("reclaims expired leases and rejects stale completion", async () => {
    const party = await newParty(2); const guest = party.tokens[1]; if (!guest) throw new Error("Missing member");
    await call(party.code, party.host, "save", prefs); await call(party.code, guest, "save", prefs);
    const first = planningStateSchema.parse((await call(party.code, party.host, "begin_lock")).data); if (!first.lease) throw new Error("Missing lease");
    const snapshotArgs = { p_code: party.code, p_lease: first.lease };
    expect((await supabase.rpc("party_plan_snapshot", snapshotArgs)).error).not.toBeNull();
    expect((await supabase.rpc("party_plan_complete", { ...snapshotArgs, p_failed: true })).error).not.toBeNull();
    const snapshot = await supabaseAdmin.rpc("party_plan_snapshot", snapshotArgs);
    expect(snapshot.error).toBeNull();
    expect(snapshot.data).toEqual(expect.objectContaining({ members: expect.arrayContaining([expect.objectContaining({ id: party.ids[1], budget: prefs.budget })]) }));
    const row = await supabaseAdmin.from("parties").select("id").eq("code", party.code).single(); if (!row.data) throw new Error("Missing test party");
    const aged = await supabaseAdmin.from("party_planning").update({ lock_started_at: new Date(Date.now() - 60_000).toISOString() }).eq("party_id", row.data.id);
    expect(aged.error).toBeNull();
    expect((await supabaseAdmin.rpc("party_plan_snapshot", snapshotArgs)).error?.message).toContain("no longer valid");
    expect((await supabaseAdmin.rpc("party_plan_complete", { ...snapshotArgs, p_failed: true })).data).toBe(false);
    const second = planningStateSchema.parse((await call(party.code, party.host, "begin_lock")).data); if (!second.lease) throw new Error("Missing replacement lease");
    expect(second.acquired).toBe(true); expect(second.lease).not.toBe(first.lease);
    expect((await supabaseAdmin.rpc("party_plan_complete", { p_code: party.code, p_lease: first.lease, p_failed: true })).data).toBe(false);
    expect(planningStateSchema.parse((await call(party.code, guest, "read")).data).status).toBe("locking");
    expect((await supabaseAdmin.rpc("party_plan_complete", { p_code: party.code, p_lease: second.lease, p_failed: true })).data).toBe(true);
    expect(planningStateSchema.parse((await call(party.code, guest, "read")).data).status).toBe("collecting");
  });
  it("validates host configuration and freezes it during lock", async () => {
    const party = await newParty(2); const guest = party.tokens[1]; if (!guest) throw new Error("Missing member");
    const configuration = { date: montrealToday(), durationMin: 90, areaLabel: "Downtown", areaLat: 45.5, areaLng: -73.57, category: "park" };
    expect((await call(party.code, party.host, "configure", configuration)).error).toBeNull();
    expect((await call(party.code, party.host, "configure", { ...configuration, durationMin: 241 })).error).not.toBeNull();
    await call(party.code, party.host, "save", prefs); await call(party.code, guest, "save", prefs);
    await call(party.code, party.host, "begin_lock");
    expect((await call(party.code, party.host, "configure", configuration)).error?.message).toContain("frozen");
  });
});
