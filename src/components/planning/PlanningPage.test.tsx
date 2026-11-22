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
  days: vi.fn(),
}));
// Offered days and host readiness come from the party_plan_days RPC.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.days } }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.planning }));
// The route and the wizard both reach the same capability-verified RPC.
vi.mock("@/lib/planning.functions", () => ({ updatePartyPlanning: mocks.planning }));
vi.mock("@/lib/planning/tz", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/planning/tz")>()),
  montrealNowMinutes: () => 18 * 60,
  montrealToday: () => "2026-11-22",
}));
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
  mocks.days
    .mockReset()
    .mockResolvedValue({ data: { dates: [], selfWindows: null, hostReady: true }, error: null });
});
afterEach(() => {
  cleanup();
  client?.clear();
});

describe("Planning screen polling and recovery", () => {
  it("keeps the working single-day wizard when the days update is not installed", async () => {
    mocks.days.mockResolvedValue({ data: null, error: {
      code: "PGRST202", message: "Could not find the function public.party_plan_days",
    } });
    open();
    const slider = await screen.findByRole("slider", { name: "Budget per person" });
    fireEvent.focus(slider);
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveAttribute("aria-valuenow", "100");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.planning.mock.calls.every(([input]) => input.data.action === "read")).toBe(true);
  });
  it("does not fall back on a rejected membership check", async () => {
    mocks.days.mockResolvedValue({ data: null, error: { code: "42501", message: "Invalid membership" } });
    open();
    await screen.findByRole("alert");
    expect(screen.queryByRole("slider")).toBeNull();
    expect(mocks.planning.mock.calls.every(([input]) => input.data.action === "read")).toBe(true);
  });
  it("clears both private planning caches when leaving the multi-day screen", async () => {
    const view = open();
    await screen.findByRole("heading", { name: "When's the hangout?" });
    view.unmount();
    await waitFor(() => {
      expect(client.getQueryData(["party-planning", "ABC123"])).toBeUndefined();
      expect(client.getQueryData(["party-planning-days", "ABC123"])).toBeUndefined();
    });
  });
  it("checks guest party access before reading planning", async () => {
    mocks.party.mockRejectedValue(new Error("Join this party"));
    open();
    await screen.findByText("Let's find your crew.");
    expect(mocks.planning).not.toHaveBeenCalled();
  });
  it("opens the slider wizard on the host's day question without a step in the URL", async () => {
    open();
    await screen.findByRole("heading", { name: "When's the hangout?" });
    expect(screen.getByRole("radio", { name: /Today/ })).toBeInTheDocument();
  });
  it("opens the budget slider when the URL asks for it", async () => {
    mocks.search = { step: "budget" };
    open();
    await screen.findByRole("heading", { name: "What's your budget?" });
    expect(screen.getByRole("slider", { name: "Budget per person" })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
  });
  it("uses the existing capability only as RPC input, not in cache keys", async () => {
    open();
    await screen.findByRole("heading", { name: "When's the hangout?" });
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
      ["party-planning-days", "ABC123"],
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
      JSON.stringify({
        spend: 50,
        day: "today",
        freeFrom: "18:00",
        freeTo: "22:00",
        travelMin: 35,
        vibe: "eats",
        dayFree: { "2026-11-22": [36, 37, 38, 39, 40, 41, 42, 43] },
      }),
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
    expect(screen.getByRole("radio", { name: "Getting eats" })).toBeChecked();
  });
  it("discards private preference cache after leaving the screen", async () => {
    const view = open();
    await screen.findByRole("heading", { name: "When's the hangout?" });
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
    mocks.search = { step: "budget" };
    open();
    const slider = await screen.findByRole("slider", { name: "Budget per person" });
    fireEvent.focus(slider);
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveAttribute("aria-valuetext", "$100+ per person, Treat ourselves");
    mocks.planning.mockRejectedValue(new Error("network unavailable"));
    await client.invalidateQueries({ queryKey: ["party-planning", "ABC123"] });
    await screen.findByRole("alert");
    expect(screen.getByRole("slider", { name: "Budget per person" })).toHaveAttribute(
      "aria-valuetext",
      "$100+ per person, Treat ourselves",
    );
  });
});
