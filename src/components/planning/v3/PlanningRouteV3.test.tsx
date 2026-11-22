import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { guestId, hostId, party, thirdId, v2State, v3Config, v3Plan, v3State } from "./test-utils";
vi.mock("../PlanMap", () => ({ PlanMap: () => null }));

// MOCKED server function and party RPC: these tests never reach a database.
const mocks = vi.hoisted(() => ({ planning: vi.fn(), party: vi.fn(), navigate: vi.fn(), days: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.days, auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.planning }));
vi.mock("@/lib/planning.functions", () => ({ updatePartyPlanning: vi.fn() }));
vi.mock("@/lib/party", () => ({ accessParty: mocks.party, membershipToken: () => "b".repeat(64) }));
vi.mock("@/components/PartyHeader", () => ({ PartyHeader: () => null }));
vi.mock("@/components/PartyInviteQR", () => ({
  PartyInviteQR: ({ code }: { code: string }) => <p>Invite {code}</p>,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ code: "ABC123" }),
    useSearch: () => ({}),
  }),
  useHydrated: () => true,
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
import { Route } from "@/routes/party.$code_.plan";
import { planningRequest } from "../usePartyWorkflow";

// These flows render large accessible grids; role queries are slow under a parallel run.
vi.setConfig({ testTimeout: 20_000 });
// The guest hasn't answered yet, so the private wizard opens first.
const unanswered = () =>
  v3State({
    members: [
      { id: hostId, submitted: true },
      { id: guestId, submitted: false },
    ],
  });
let client: QueryClient;
function open() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Component = Route.options.component as ComponentType;
  return render(
    <QueryClientProvider client={client}>
      <Component />
    </QueryClientProvider>,
  );
}
function answerAll() {
  fireEvent.click(screen.getByRole("button", { name: "Adventurous" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Under $15" }));
  fireEvent.click(screen.getByLabelText("No hard limit"));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "I'm free all day" }));
  fireEvent.click(screen.getByRole("button", { name: /Thursday, November 26/ }));
  fireEvent.click(screen.getByRole("button", { name: "I'm free all day" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByLabelText(/Mile End/));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("radio", { name: "Transit" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}
beforeEach(() => {
  mocks.planning.mockReset();
  mocks.party.mockReset();
  mocks.days.mockReset().mockResolvedValue({
    data: { dates: [], hostReady: true, selfWindows: null, revision: 4 }, error: null,
  });
  mocks.party.mockResolvedValue({ ...party, selfId: guestId, isHost: false });
});
afterEach(() => {
  cleanup();
  client?.clear();
});

describe("Planning route V3 integration", () => {
  it("keeps the current V2 planner by default and offers a labelled, local-only preview", async () => {
    mocks.planning.mockResolvedValue({ ...v2State, members: [{ id: hostId, submitted: true }, { id: guestId, submitted: false }] });
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Preview the new planner" }));
    expect(screen.getByText("This party still uses the current planner")).toBeInTheDocument();
    expect(window.location.search).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Back to the current planner" }));
    expect(
      await screen.findByRole("button", { name: "Preview the new planner" }),
    ).toBeInTheDocument();
    expect(
      mocks.planning.mock.calls.every(
        ([call]) => call.data.action === "read" && call.data.schemaVersion === 3,
      ),
    ).toBe(true);
  });

  it("uses V3 screens when the server advertises schemaVersion 3 and saves the canonical payload", async () => {
    const saved = v3State({
      members: [
        { id: hostId, submitted: true },
        { id: guestId, submitted: true },
      ],
    });
    mocks.planning.mockImplementation(({ data }: { data: { action: string } }) =>
      Promise.resolve(data.action === "save" ? saved : unanswered()),
    );
    open();
    expect(await screen.findByRole("heading", { name: "What's the vibe?" })).toBeInTheDocument();
    expect(screen.queryByText("This party still uses the current planner")).toBeNull();
    answerAll();
    fireEvent.click(screen.getByRole("button", { name: "Save & join the plan" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/party/$code", params: { code: "ABC123" }, replace: true,
    }));
    const save = mocks.planning.mock.calls.find(([call]) => call.data.action === "save")![0];
    expect(save.data).toMatchObject({
      action: "save",
      schemaVersion: 3,
      // The engine requires the revision the draft was based on for every V3 save.
      revision: 4,
      code: "ABC123",
      token: "b".repeat(64),
      preferences: {
        version: 3,
        vibes: ["adventurous"],
        budget: {
          preferredMinCad: 0,
          preferredMaxCad: 15,
          hardMaxCad: null,
          explicitlyUnlimited: true,
        },
        availability: {
          mode: "calendar",
          days: [
            { date: "2026-11-24", confirmed: true, busyIntervals: [] },
            { date: "2026-11-26", confirmed: true, busyIntervals: [] },
          ],
        },
        travel: { mode: "transit", maxOneWayMinutes: 30 },
      },
    });
    // Capabilities and private answers never enter cache keys.
    const keys = JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((entry) => entry.queryKey),
    );
    expect(keys).toBe(
      JSON.stringify([
        ["party", "ABC123"],
        ["party-planning", "ABC123"],
        ["party-planning-days", "ABC123"],
        ["party-social", "ABC123", guestId],
      ]),
    );
    expect(keys).not.toContain("b".repeat(64));
  });

  it("keeps the draft and shows an error when the save is not confirmed", async () => {
    mocks.planning.mockImplementation(({ data }: { data: { action: string } }) =>
      data.action === "save" ? Promise.reject(new Error("network")) : Promise.resolve(unanswered()),
    );
    open();
    await screen.findByRole("heading", { name: "What's the vibe?" });
    answerAll();
    fireEvent.click(screen.getByRole("button", { name: "Save & join the plan" }));
    expect(await screen.findByText(/Your save wasn't confirmed/)).toBeInTheDocument();
    expect(screen.queryByText("Your answers are saved. You're ready!")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit Vibe" }));
    expect(screen.getByRole("button", { name: "Adventurous" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("bootstraps a collecting V2 party into V3 with the host's first configure", async () => {
    mocks.party.mockResolvedValue(party);
    let current: unknown = { ...v2State };
    mocks.planning.mockImplementation(({ data }: { data: { action: string } }) => {
      if (data.action === "configure") current = v3State({ revision: 5 });
      return Promise.resolve(current);
    });
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Switch to the new planner" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch to the new planner" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch to the new planner & save" }));
    expect(await screen.findByText(/This party now uses the new planner/)).toBeInTheDocument();
    const configure = mocks.planning.mock.calls.find(
      ([call]) => call.data.action === "configure",
    )![0];
    expect(configure.data).toMatchObject({
      action: "configure",
      schemaVersion: 3,
      code: "ABC123",
      config: { version: 3, dateSelection: { mode: "today_tonight" } },
    });
    // The banner is gone: the server now reports a V3 party.
    await waitFor(() =>
      expect(screen.queryByText("This party still uses the current planner")).toBeNull(),
    );
  });

  it("sends the current revision with V3 finalize", async () => {
    mocks.party.mockResolvedValue(party);
    const locked = v3State({
      status: "locked",
      plan: v3Plan,
      optionCount: 2,
      revision: 12,
      members: [
        { id: hostId, submitted: true },
        { id: guestId, submitted: true },
        { id: thirdId, submitted: false },
      ],
    });
    mocks.planning.mockResolvedValue(locked);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Finalize" }));
    await waitFor(() =>
      expect(mocks.planning.mock.calls.some(([call]) => call.data.action === "finalize")).toBe(
        true,
      ),
    );
    const finalize = mocks.planning.mock.calls.find(
      ([call]) => call.data.action === "finalize",
    )![0];
    expect(finalize.data).toEqual({
      action: "finalize",
      revision: 12,
      schemaVersion: 3,
      code: "ABC123",
      token: "b".repeat(64),
    });
  });
});

describe("planningRequest", () => {
  const token = "c".repeat(64);
  it("tags legacy commands as V2 and everything on a V3 party as V3", () => {
    expect(planningRequest({ action: "vote", revision: 3 }, v2State, "ABC123", token)).toEqual({
      action: "vote",
      revision: 3,
      schemaVersion: 2,
      code: "ABC123",
      token,
    });
    expect(planningRequest({ action: "lock" }, v3State(), "ABC123", token)).toMatchObject({
      action: "lock",
      schemaVersion: 3,
    });
  });
  it("treats a V3 configure as the bootstrap even while the party is still V2", () => {
    expect(
      planningRequest({ action: "configure", config: v3Config }, v2State, "ABC123", token),
    ).toMatchObject({ action: "configure", schemaVersion: 3, config: { version: 3 } });
  });
});
