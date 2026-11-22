import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Json } from "@/integrations/supabase/types";
import { executePlanning } from "@/lib/planning/service.server";
import { solveV3 } from "@/lib/planning-v3/solver";
import { day, hostConfig, memberIds, now, prefs, snapshot, venue } from "./planning-v3-fixtures";

const { rpc, admin } = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: admin } }));
vi.mock("@/lib/planning-v3/catalogue", async () => {
  const { venue } = await import("./planning-v3-fixtures");
  return { curatedVenuesV3: [venue()] };
});
vi.mock("@/lib/planning-v3/weather.server", () => ({ fetchV3Weather: async () => new Map() }));
vi.mock("@/lib/planning-v3/routes.server", () => ({
  googleRoutes: () => ({
    route: async ({ at, timing }: { at: number; timing: string }) =>
      timing === "arrive" ? { start: at - 600_000, end: at } : { start: at, end: at + 600_000 },
  }),
}));
const lease = "33333333-3333-4333-8333-333333333333";
const credentials = { code: "ABC123", token: "a".repeat(64), schemaVersion: 3 } as const;
const state = {
  schemaVersion: 3,
  revision: 2,
  config: hostConfig(),
  status: "collecting",
  members: memberIds.map((id) => ({ id, submitted: true })),
  selfPreferences: null,
  plan: null,
  planIndex: 0,
  optionCount: 0,
  groupRerollsUsed: 0,
  votes: 0,
  voteThreshold: 1,
  selfVoted: false,
  noPlanReason: null,
  venueSource: null,
};

beforeEach(() => {
  rpc.mockReset();
  admin.mockReset();
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubEnv("SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("V3 service and RPC boundary", () => {
  it("sends canonical config and saves only after validating the host dates and revision", async () => {
    rpc.mockResolvedValue({ data: state });
    await executePlanning({ ...credentials, action: "configure", payload: hostConfig() });
    await executePlanning({ ...credentials, action: "save", payload: prefs() });
    expect(rpc.mock.calls.map(([name, args]) => [name, args.p_action])).toEqual([
      ["party_plan", "configure"],
      ["party_plan", "read"],
      ["party_plan", "save"],
    ]);
    expect(rpc.mock.calls[0]?.[1].p_payload).toEqual(hostConfig());
    expect(rpc.mock.calls[2]?.[1].p_payload).toEqual({
      preferences: prefs(),
      expectedRevision: state.revision,
    });
    const invalid = prefs();
    invalid.availability.days[0]!.confirmed = false;
    await expect(
      executePlanning({ ...credentials, action: "save", payload: invalid }),
    ).rejects.toThrow("Check the planning");
    expect(rpc).toHaveBeenCalledTimes(4);
  });

  it("discards nested private fields and exposes only the authenticated caller's projected result", async () => {
    const caller = prefs();
    const guest = {
      ...prefs(),
      optionalNote: "private allergy detail",
      dietaryHardRequirements: ["private-allergy"],
      origin: { ...prefs().origin, lat: 45.512987 },
      availability: {
        ...prefs().availability,
        days: [
          {
            date: day,
            confirmed: true,
            busyIntervals: [{ startAt: "2026-11-23T09:00:00Z", endAt: "2026-11-23T09:30:00Z" }],
          },
        ],
      },
    };
    const [plan] = await solveV3(
      snapshot(),
      [venue()],
      {
        route: async ({ at, timing }) =>
          timing === "arrive" ? { start: at - 600_000, end: at } : { start: at, end: at + 600_000 },
      },
      new Map(),
      now,
    );
    rpc.mockResolvedValue({
      data: {
        ...state,
        status: "locked",
        optionCount: 1,
        selfPreferences: caller,
        plan: { ...plan, scores: [1, 0], venue: { ...plan?.venue, origins: [guest.origin] } },
        members: state.members.map((member) => ({ ...member, preferences: guest })),
        snapshot: { members: [caller, guest] },
      },
    });
    const result = await executePlanning({ ...credentials, action: "read", payload: {} });
    expect(result).toMatchObject({
      schemaVersion: 3,
      selfPreferences: caller,
      members: state.members,
      plan,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private-allergy|45\.512987|busyIntervals":\[\{|scores|snapshot|origins/,
    );
    expect(rpc).toHaveBeenCalledWith(
      "party_plan",
      expect.objectContaining({ p_action: "read", p_token: credentials.token }),
    );
    expect(admin).not.toHaveBeenCalled();
  });

  it("uses one acquired lease and persists only sanitized V3 ranking and current revision", async () => {
    rpc
      .mockResolvedValueOnce({ data: state })
      .mockResolvedValueOnce({ data: state })
      .mockResolvedValueOnce({ data: { ...state, status: "locking", acquired: true, lease } })
      .mockResolvedValueOnce({
        data: { ...state, status: "locking", acquired: false, lease: null },
      })
      .mockResolvedValueOnce({ data: { ...state, status: "no_plan", noPlanReason: "no_match" } });
    admin.mockResolvedValueOnce({ data: snapshot() }).mockResolvedValueOnce({ data: true });
    const outputs = await Promise.all(
      [1, 2].map(() => executePlanning({ ...credentials, action: "lock", payload: {} })),
    );
    expect(admin).toHaveBeenCalledTimes(2);
    expect(admin).toHaveBeenNthCalledWith(1, "party_plan_snapshot", {
      p_code: credentials.code,
      p_lease: lease,
    });
    expect(admin).toHaveBeenNthCalledWith(
      2,
      "party_plan_complete",
      expect.objectContaining({
        p_lease: lease,
        p_source: "curated",
        p_options: [
          expect.objectContaining({ version: 3, routeVerifiability: "provider_verified" }),
        ],
      }),
    );
    expect(JSON.stringify(admin.mock.calls[1]?.[1])).not.toMatch(
      /selfPreferences|members|scores|45\.51[,}]/,
    );
    expect(outputs.some((output) => output.status === "locking")).toBe(true);
    expect(outputs.find((output) => output.status === "no_plan")).toMatchObject({
      suggestedActions: [
        "expand_dates",
        "expand_area",
        "shorten_duration",
        "review_own_preferences",
      ],
    });
  });

  it("rejects an old snapshot or stale completion without publishing another lease's result", async () => {
    for (const raw of [
      { ...snapshot(), revision: 1 },
      { ...snapshot(), schemaVersion: 2 },
      snapshot(),
    ]) {
      rpc
        .mockReset()
        .mockResolvedValue({ data: { ...state, status: "locking", lease, acquired: true } });
      admin.mockReset().mockResolvedValueOnce({ data: raw }).mockResolvedValue({ data: false });
      await expect(
        executePlanning({ ...credentials, action: "lock", payload: {} }),
      ).rejects.toThrow("preferences are saved");
      expect(admin.mock.calls.at(-1)).toEqual([
        "party_plan_complete",
        { p_code: credentials.code, p_lease: lease, p_failed: true },
      ]);
      if (raw !== undefined && (raw.revision === 1 || raw.schemaVersion === 2))
        expect(admin).toHaveBeenCalledTimes(2);
    }
  });

  it("keeps RPC failures generic and refuses to interpret V2 or unknown results as V3 mutations", async () => {
    rpc.mockResolvedValueOnce({
      error: { message: "private allergy and precise coordinates 45.512987" },
    });
    await expect(executePlanning({ ...credentials, action: "read", payload: {} })).rejects.toThrow(
      /^The planning request could not be completed/,
    );
    rpc.mockResolvedValueOnce({ data: { ...state, schemaVersion: 4 } });
    await expect(executePlanning({ ...credentials, action: "read", payload: {} })).rejects.toThrow(
      "temporarily unavailable",
    );
    const legacy = {
      ...state,
      schemaVersion: 2,
      config: {
        date: day,
        durationMin: 60,
        areaLabel: "Montreal",
        area: { lat: 45.51, lng: -73.57 },
        category: "park",
      },
    };
    rpc.mockResolvedValueOnce({ data: legacy });
    expect(await executePlanning({ ...credentials, action: "read", payload: {} })).toHaveProperty(
      "schemaVersion",
      2,
    );
    rpc.mockResolvedValueOnce({ data: legacy });
    await expect(
      executePlanning({ ...credentials, action: "configure", payload: hostConfig() }),
    ).rejects.toThrow("compatible planning version");
  });

  it("stops a V3 lock on a V2 deployment before any mutating RPC", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ...state,
        schemaVersion: 2,
        config: {
          date: day,
          durationMin: 60,
          areaLabel: "Montreal",
          area: { lat: 45.51, lng: -73.57 },
          category: "park",
        },
      },
    });
    await expect(executePlanning({ ...credentials, action: "lock", payload: {} })).rejects.toThrow(
      "compatible planning version",
    );
    expect(rpc.mock.calls.map(([, args]) => args.p_action)).toEqual(["read"]);
    expect(admin).not.toHaveBeenCalled();
  });

  it("forwards revisioned lifecycle actions without privileged calls or reranking", async () => {
    rpc.mockResolvedValue({ data: state });
    const actions = ["vote", "host_reroll", "finalize", "reopen"] as const;
    for (const action of actions) {
      const payload: Json = action === "reopen" ? {} : { revision: 2 };
      await executePlanning({ ...credentials, action, payload });
    }
    expect(
      rpc.mock.calls
        .filter(([, args]) => args.p_action !== "read")
        .map(([, args]) => [args.p_action, args.p_payload]),
    ).toEqual([
      ["vote", { schemaVersion: 3, revision: 2 }],
      ["host_reroll", { schemaVersion: 3, revision: 2 }],
      ["finalize", { schemaVersion: 3, revision: 2 }],
      ["reopen", { schemaVersion: 3 }],
    ]);
    expect(admin).not.toHaveBeenCalled();
  });
});
