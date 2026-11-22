import { expect, it } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { partySchema } from "@/lib/party";
import { shiftDate, montrealToday, wallTime } from "@/lib/planning/tz";
import { leaseFields, projectState } from "@/lib/planning-v3/state";
import { solveV3 } from "@/lib/planning-v3/solver";
import { describeIsolatedDatabase, installIsolatedSupabaseHooks } from "./isolated-supabase";
import { hostConfig, iso, prefs, venue } from "./planning-v3-fixtures";
import type { HostConfigV3, SnapshotV3 } from "@/lib/planning-v3/schema";

const owned = installIsolatedSupabaseHooks();
const token = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const parse = (raw: unknown) => {
  const state = projectState(raw, Date.now());
  if (state.schemaVersion !== 3) throw new Error("V3 SQL contract is required for this suite.");
  return state;
};

async function makeParty() {
  const host = token();
  const guest = token();
  const created = await supabase.rpc("party_access", {
    p_action: "create",
    p_code: "",
    p_token: host,
    p_name: "V3 isolated host",
  });
  if (created.error) throw new Error("Could not create isolated party.");
  const party = partySchema.parse(created.data);
  owned.push(party.code);
  const joined = await supabase.rpc("party_access", {
    p_action: "join",
    p_code: party.code,
    p_token: guest,
    p_name: "V3 isolated guest",
  });
  if (joined.error) throw new Error("Could not join isolated party.");
  const guestId = partySchema.parse(joined.data).selfId;
  const call = (as: string, action: string, p_payload: Json = { schemaVersion: 3 }) =>
    supabase.rpc("party_plan", {
      p_code: party.code,
      p_token: as,
      p_action: action,
      p_payload,
    });
  const day = shiftDate(montrealToday(), 1);
  const config = hostConfig();
  config.dateSelection.candidateDates = [day];
  const save = async (caller: string, preferences = answers(day)) => {
    const state = parse((await call(caller, "read")).data);
    return call(caller, "save", { preferences, expectedRevision: state.revision });
  };
  return { host, guest, hostId: party.selfId, guestId, code: party.code, call, save, day, config };
}

function answers(day: string) {
  const p = prefs();
  p.availability.days[0]!.date = day;
  return p;
}

async function configure(
  party: Awaited<ReturnType<typeof makeParty>>,
  config: HostConfigV3 = party.config,
) {
  const result = await party.call(party.host, "configure", config);
  expect(result.error).toBeNull();
  return parse(result.data);
}

describeIsolatedDatabase("Planning V3 isolated RPC", () => {
  it("validates capability and roles, saves V3 fields privately and revokes removed membership", async () => {
    const party = await makeParty();
    expect((await party.call(token(), "read")).error).not.toBeNull();
    expect((await party.call(party.guest, "configure", party.config)).error).not.toBeNull();
    expect((await configure(party)).config).toEqual(party.config);
    expect((await party.call(party.guest, "begin_lock")).error).not.toBeNull();
    expect((await party.call(party.host, "begin_lock")).error).not.toBeNull();
    const guestAnswer = answers(party.day);
    guestAnswer.origin.lat = 45.523456;
    guestAnswer.origin.accuracy = "precise_ephemeral";
    guestAnswer.dietaryHardRequirements = ["test_private_allergy"];
    guestAnswer.availability.days[0]!.busyIntervals = [
      { startAt: iso(wallTime(party.day, "11:00")), endAt: iso(wallTime(party.day, "12:00")) },
    ];
    const malformed = { ...guestAnswer, memberId: party.hostId };
    const before = parse((await party.call(party.guest, "read")).data);
    expect(
      (
        await party.call(party.guest, "save", {
          preferences: malformed,
          expectedRevision: before.revision,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await party.call(party.guest, "save", {
          preferences: guestAnswer,
          expectedRevision: before.revision - 1,
        })
      ).error?.message,
    ).toContain("plan changed");
    expect((await party.save(party.guest, guestAnswer)).error).toBeNull();
    expect((await party.save(party.host)).error).toBeNull();
    const guest = parse((await party.call(party.guest, "read")).data);
    const rawHost = (await party.call(party.host, "read")).data;
    expect(guest.selfPreferences?.dietaryHardRequirements).toEqual(
      guestAnswer.dietaryHardRequirements,
    );
    expect(guest.selfPreferences?.origin.lat).toBe(guestAnswer.origin.lat);
    expect(parse(rawHost).members.every((member) => member.submitted)).toBe(true);
    expect(JSON.stringify(rawHost)).not.toMatch(
      /45\.523456|test_private_allergy|lockSnapshot|lease/,
    );
    expect((await supabase.from("party_preferences").select("*")).error).not.toBeNull();
    const removed = await supabase.rpc("party_access", {
      p_action: "remove",
      p_code: party.code,
      p_token: party.host,
      p_member: party.guestId,
    });
    expect(removed.error).toBeNull();
    expect((await party.call(party.guest, "read")).error).not.toBeNull();
  });

  it("leases one snapshot, rejects stale completion and preserves three votes, frozen rankings and finalization", async () => {
    const party = await makeParty();
    await configure(party);
    for (const who of [party.host, party.guest]) expect((await party.save(who)).error).toBeNull();
    const attempts = await Promise.all([
      party.call(party.host, "begin_lock"),
      party.call(party.host, "begin_lock"),
    ]);
    expect(attempts.every((attempt) => attempt.error === null)).toBe(true);
    const winner = attempts
      .map((response) => leaseFields.parse(response.data))
      .filter((result) => result.acquired);
    expect(winner).toHaveLength(1);
    const expired = winner[0]!.lease!;
    expect(
      (await supabase.rpc("party_plan_snapshot", { p_code: party.code, p_lease: expired })).error,
    ).not.toBeNull();
    const row = await supabaseAdmin.from("parties").select("id").eq("code", party.code).single();
    expect(row.error).toBeNull();
    const aged = await supabaseAdmin
      .from("party_planning")
      .update({ lock_started_at: iso(Date.now() - 60_000) })
      .eq("party_id", row.data!.id);
    expect(aged.error).toBeNull();
    const retry = await party.call(party.host, "begin_lock");
    const lease = leaseFields.parse(retry.data).lease!;
    expect(lease).not.toBe(expired);
    expect(
      (
        await supabaseAdmin.rpc("party_plan_complete", {
          p_code: party.code,
          p_lease: expired,
          p_failed: true,
        })
      ).data,
    ).toBe(false);
    const rawSnapshot = await supabaseAdmin.rpc("party_plan_snapshot", {
      p_code: party.code,
      p_lease: lease,
    });
    expect(rawSnapshot.error).toBeNull();
    expect(rawSnapshot.data).toMatchObject({
      schemaVersion: 3,
      revision: parse(retry.data).revision,
      members: expect.arrayContaining([
        { id: party.hostId, preferences: expect.objectContaining({ version: 3 }) },
        { id: party.guestId, preferences: expect.objectContaining({ version: 3 }) },
      ]),
    });
    const candidate = venue();
    candidate.opening = [
      { start: wallTime(party.day, "16:00"), end: wallTime(party.day, "22:00") },
    ];
    candidate.expiresAt = wallTime(party.day, "24:00");
    const options = await solveV3(
      rawSnapshot.data as unknown as SnapshotV3,
      [candidate],
      {
        route: async ({ at, timing }) =>
          timing === "arrive" ? { start: at - 600_000, end: at } : { start: at, end: at + 600_000 },
      },
      new Map(),
      Date.now(),
    );
    expect(options.length).toBeGreaterThan(4);
    const completed = await supabaseAdmin.rpc("party_plan_complete", {
      p_code: party.code,
      p_lease: lease,
      p_options: options.map((option) => ({ ...option, score: 42 })),
      p_source: "curated",
    });
    expect(completed.data).toBe(true);
    let state = parse((await party.call(party.host, "read")).data);
    expect(state.plan).toEqual(options[0]);
    expect(
      (await party.call(party.guest, "vote", { schemaVersion: 3, revision: state.revision - 1 }))
        .error,
    ).not.toBeNull();
    for (const count of [1, 2, 3]) {
      const vote = await party.call(party.guest, "vote", {
        schemaVersion: 3,
        revision: state.revision,
      });
      state = parse(vote.data);
      expect(state.groupRerollsUsed).toBe(count);
      expect(state.plan).toEqual(options[count]);
    }
    expect(
      (await party.call(party.guest, "vote", { schemaVersion: 3, revision: state.revision })).error,
    ).not.toBeNull();
    expect(
      (await party.call(party.guest, "finalize", { schemaVersion: 3, revision: state.revision }))
        .error,
    ).not.toBeNull();
    const finalized = await party.call(party.host, "finalize", {
      schemaVersion: 3,
      revision: state.revision,
    });
    expect(parse(finalized.data).status).toBe("final");
  });

  it("persists and reads the actual date for an overnight slot outside the selected date list", async () => {
    const party = await makeParty();
    await configure(party);
    for (const who of [party.host, party.guest]) expect((await party.save(who)).error).toBeNull();
    const lock = await party.call(party.host, "begin_lock");
    const lease = leaseFields.parse(lock.data).lease!;
    const rawSnapshot = await supabaseAdmin.rpc("party_plan_snapshot", {
      p_code: party.code,
      p_lease: lease,
    });
    expect(rawSnapshot.error).toBeNull();
    const candidate = venue();
    const start = wallTime(party.day, "01:00", 1);
    candidate.opening = [{ start, end: wallTime(party.day, "02:00", 1) }];
    candidate.expiresAt = wallTime(party.day, "06:00", 1);
    const options = await solveV3(
      rawSnapshot.data as unknown as SnapshotV3,
      [candidate],
      {
        route: async ({ at, timing }) =>
          timing === "arrive" ? { start: at - 600_000, end: at } : { start: at, end: at + 600_000 },
      },
      new Map(),
      Date.now(),
    );
    expect(options).toEqual([
      expect.objectContaining({ date: shiftDate(party.day, 1), startAt: iso(start) }),
    ]);
    const completed = await supabaseAdmin.rpc("party_plan_complete", {
      p_code: party.code,
      p_lease: lease,
      p_options: options,
      p_source: "curated",
    });
    expect(completed.error).toBeNull();
    expect(completed.data).toBe(true);
    expect(parse((await party.call(party.guest, "read")).data).plan).toEqual(options[0]);
  });

  it("reopens no-match without leaks and invalidates readiness when dates change", async () => {
    const party = await makeParty();
    await configure(party);
    for (const who of [party.host, party.guest]) expect((await party.save(who)).error).toBeNull();
    const lock = await party.call(party.host, "begin_lock");
    const lease = leaseFields.parse(lock.data).lease!;
    expect(
      (
        await supabaseAdmin.rpc("party_plan_complete", {
          p_code: party.code,
          p_lease: lease,
          p_options: [],
          p_source: "curated",
        })
      ).data,
    ).toBe(true);
    const noMatch = parse((await party.call(party.guest, "read")).data);
    expect(noMatch).toMatchObject({ status: "no_plan", plan: null, noPlanReason: "no_match" });
    expect((await party.call(party.guest, "reopen")).error).not.toBeNull();
    const reopened = parse((await party.call(party.host, "reopen")).data);
    expect(reopened).toMatchObject({ status: "collecting", plan: null, optionCount: 0, votes: 0 });
    expect(reopened.revision).toBeGreaterThan(noMatch.revision);
    expect(reopened.selfPreferences?.version).toBe(3);
    const changed = hostConfig();
    changed.dateSelection.candidateDates = [shiftDate(party.day, 1)];
    expect((await configure(party, changed)).members.every((member) => !member.submitted)).toBe(
      true,
    );
  });
});
