import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import type { PlanningState } from "@/lib/planning/types";

const mocks = vi.hoisted(() => ({
  planning: vi.fn(),
  party: vi.fn(),
  navigate: vi.fn(),
  search: {} as Record<string, unknown>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.planning }));
// The route and the wizard both reach the same capability-verified RPC.
vi.mock("@/lib/planning.functions", () => ({ updatePartyPlanning: mocks.planning }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/party", () => ({ accessParty: mocks.party, membershipToken: () => "a".repeat(64) }));
vi.mock("@/components/PartyHeader", () => ({ PartyHeader: () => null }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ code: "ABC123" }),
    useSearch: () => mocks.search,
  }),
  useHydrated: () => true,
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
import { Route } from "@/routes/party.$code_.plan";

const id = "00000000-0000-4000-8000-000000000001";
const guest = "00000000-0000-4000-8000-000000000002";
const state: PlanningState = {
  status: "collecting",
  revision: 1,
  config: {
    category: "park",
    date: "2026-11-22",
    durationMin: 60,
    areaLabel: "Plateau",
    area: { lat: 45.52, lng: -73.57 },
  },
  selfPreferences: null,
  members: [
    { id, submitted: true },
    { id: guest, submitted: true },
  ],
  plan: null,
  planIndex: 0,
  optionCount: 0,
  groupRerollsUsed: 0,
  votes: 0,
  voteThreshold: 2,
  selfVoted: false,
  noPlanReason: null,
  venueSource: null,
};
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
// Radix Slider measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
const reads = () =>
  mocks.planning.mock.calls.filter(([input]) => input.data.action === "read").length;
beforeEach(() => {
  mocks.planning.mockReset();
  mocks.party.mockReset();
  mocks.navigate.mockReset();
  mocks.search = {};
  sessionStorage.clear();
  localStorage.clear();
  mocks.party.mockResolvedValue({
    code: "ABC123",
    selfId: id,
    isHost: true,
    started: false,
    view: "team",
    hangout: null,
    members: [
      { id, name: "Host", host: true, location: null },
      { id: guest, name: "Guest", host: false, location: null },
    ],
  });
  mocks.planning.mockResolvedValue(state);
});
afterEach(() => {
  cleanup();
  client?.clear();
});

describe("Planning screen polling and recovery", () => {
  it("checks guest party access before reading planning", async () => {
    mocks.party.mockRejectedValue(new Error("Join this party"));
    open();
    await screen.findByText("Let's find your crew.");
    expect(mocks.planning).not.toHaveBeenCalled();
  });
  it("opens the slider wizard while collecting, even without a step in the URL", async () => {
    open();
    await screen.findByRole("heading", { name: "What's your budget?" });
    expect(screen.getByRole("slider", { name: "Budget" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Budget / })).toBeNull();
  });
  it("uses the existing capability only as RPC input, not in cache keys", async () => {
    open();
    await screen.findByRole("heading", { name: "What's your budget?" });
    expect(mocks.planning).toHaveBeenCalledWith({
      data: { action: "read", code: "ABC123", token: "a".repeat(64), schemaVersion: 3 },
    });
    expect(
      client
        .getQueryCache()
        .getAll()
        .map((entry) => entry.queryKey),
    ).toEqual([
      ["party", "ABC123"],
      ["party-planning", "ABC123"],
    ]);
  });
  it("shows the shared results page once planning has finished collecting", async () => {
    mocks.planning.mockResolvedValue({ ...state, status: "no_plan", noPlanReason: "no_match" });
    mocks.search = { step: "budget" };
    open();
    await screen.findByRole("heading", { name: "Planning is locked" });
    cleanup();
    mocks.search = {};
    open();
    await screen.findByRole("button", { name: "Reopen planning" });
  });
  it("keeps private answers on screen when saving fails", async () => {
    sessionStorage.setItem(
      "baggle-plan-draft-ABC123",
      JSON.stringify({ budget: 3, freeFrom: "18:00", freeTo: "22:00", km: 7, vibe: "food" }),
    );
    mocks.search = { step: "vibe" };
    mocks.planning.mockImplementation(({ data }: { data: { action: string } }) =>
      data.action === "save" ? Promise.reject(new Error("network failed")) : Promise.resolve(state),
    );
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Save my answers" }));
    await waitFor(() =>
      expect(mocks.planning.mock.calls.some(([input]) => input.data.action === "save")).toBe(true),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save my answers" })).toBeEnabled(),
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Getting food" })).toBeChecked();
  });
  it("discards private preference cache after leaving the screen", async () => {
    const view = open();
    await screen.findByRole("heading", { name: "What's your budget?" });
    view.unmount();
    await waitFor(() => expect(client.getQueryData(["party-planning", "ABC123"])).toBeUndefined());
  });
  it("refreshes a stale revision before another action", async () => {
    const noPlan = { ...state, status: "no_plan" as const, noPlanReason: "no_match" as const };
    mocks.planning.mockImplementation(({ data }: { data: { action: string } }) =>
      data.action === "reopen"
        ? Promise.reject(new Error("stale revision"))
        : Promise.resolve(noPlan),
    );
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Reopen planning" }));
    await screen.findByRole("alert");
    await waitFor(() => expect(reads()).toBeGreaterThanOrEqual(2));
    expect(
      mocks.planning.mock.calls.filter(([input]) => input.data.action === "reopen"),
    ).toHaveLength(1);
  });
  it("preserves slider edits when a background read fails", async () => {
    open();
    const slider = await screen.findByRole("slider", { name: "Budget" });
    fireEvent.focus(slider);
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveAttribute("aria-valuetext", "$$$, A bit fancy");
    mocks.planning.mockRejectedValue(new Error("network unavailable"));
    await client.invalidateQueries({ queryKey: ["party-planning", "ABC123"] });
    await screen.findByRole("alert");
    expect(screen.getByRole("slider", { name: "Budget" })).toHaveAttribute(
      "aria-valuetext",
      "$$$, A bit fancy",
    );
  });
});
