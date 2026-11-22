/**
 * Wire contract: requests built by the real UI → the engine's server-function validator and
 * RPC payload builder (src/lib/planning-v3/request.ts). No network or database is involved;
 * this proves the request shape at the server-function boundary only.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({ useServerFn: vi.fn(), createServerFn: vi.fn() }));
vi.mock("@/lib/planning.functions", () => ({ updatePartyPlanning: vi.fn() }));
vi.mock("@/lib/party", () => ({ accessParty: vi.fn(), membershipToken: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useHydrated: vi.fn(),
  useNavigate: vi.fn(),
  Link: vi.fn(),
}));
import { planningRequest } from "@/routes/party.$code_.plan";
import { parsePlanningRequest, preparePlanningCommand } from "@/lib/planning-v3/request";
import { hostPayload, emptyHostDraft } from "./host-model";
import { memberPayload, emptyMemberDraft } from "./member-model";
import { tonightOptions, todayIn } from "./time";
import { v2State, v3State } from "./test-utils";
import type { PlanningCommandV3, VersionedPlanningState } from "./contract";

const code = "ABC123";
const token = "d".repeat(64);
const now = Date.now();
const today = todayIn(now);
const config = hostPayload(
  {
    ...emptyHostDraft(),
    dateMode: "today_tonight",
    areaMode: "host_area",
    area: { label: "Le Plateau", lat: 45.52, lng: -73.58 },
    fixedMinutes: 30,
  },
  today,
);
const preferences = memberPayload(
  {
    ...emptyMemberDraft(),
    vibes: ["chill_cozy"],
    ceiling: { kind: "unlimited" },
    departure: { kind: "anytime" },
    returnBy: { kind: "none" },
    origin: { source: "group_area", label: "Le Plateau" },
    travelMode: "walk",
  },
  {
    availabilityMode: "tonight",
    candidateDates: [today],
    sharedTravel: false,
    groupArea: { label: "Le Plateau", lat: 45.52, lng: -73.58 },
    freeOnly: false,
    minMinutes: 30,
    now,
  },
);
const toRpc = (
  command: PlanningCommandV3,
  state: VersionedPlanningState = v3State({ revision: 7 }),
) => preparePlanningCommand(parsePlanningRequest(planningRequest(command, state, code, token)));

describe("UI requests accepted by the engine's server function", () => {
  it("bootstraps V3 from a legacy party with the canonical config", () => {
    expect(toRpc({ action: "configure", config }, v2State)).toEqual({
      action: "configure",
      code,
      token,
      schemaVersion: 3,
      payload: config,
    });
  });

  it("saves private answers with the revision the draft was based on", () => {
    // The RPC payload matches the database handoff: { preferences, expectedRevision }.
    expect(toRpc({ action: "save", preferences, revision: 7 })).toEqual({
      action: "save",
      code,
      token,
      schemaVersion: 3,
      payload: { preferences, expectedRevision: 7 },
    });
  });

  it.each([
    [{ action: "lock" } as const, {}],
    [{ action: "reopen" } as const, {}],
    [{ action: "vote", revision: 7 } as const, { revision: 7 }],
    [{ action: "host_reroll", revision: 7 } as const, { revision: 7 }],
    [{ action: "finalize", revision: 7 } as const, { revision: 7 }],
  ])("lifecycle %o is tagged V3 with its revision", (command, payload) => {
    expect(toRpc(command)).toMatchObject({ action: command.action, schemaVersion: 3, payload });
  });

  it("rejects a V3 save without a revision (the bug this test guards)", () => {
    expect(() =>
      parsePlanningRequest({ action: "save", code, token, schemaVersion: 3, preferences }),
    ).toThrow();
  });

  it("keeps legacy commands on the V2 path", () => {
    expect(toRpc({ action: "vote", revision: 2 }, v2State)).toMatchObject({
      schemaVersion: 2,
      payload: { revision: 2 },
    });
  });

  it("tonight options stay inside the server's accepted window", () => {
    const { departures } = tonightOptions(now);
    expect(departures.every((option) => !option.nextDay)).toBe(true);
  });
});
