import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import type { PlanningState } from "@/lib/planning/types";

const mocks = vi.hoisted(() => ({ planning: vi.fn(), party: vi.fn(), navigate: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.planning }));
vi.mock("@/lib/planning.functions", () => ({ updatePartyPlanning: vi.fn() }));
vi.mock("@/lib/party", () => ({ accessParty: mocks.party, membershipToken: () => "a".repeat(64) }));
vi.mock("@/components/PartyHeader", () => ({ PartyHeader: () => null }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useParams: () => ({ code: "ABC123" }) }),
  useHydrated: () => true, useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
import { Route } from "@/routes/party.$code_.plan";

const id = "00000000-0000-4000-8000-000000000001";
const guest = "00000000-0000-4000-8000-000000000002";
const state: PlanningState = { status: "collecting", revision: 1, config: { category: "park", date: "2026-11-22", durationMin: 60, areaLabel: "Plateau", area: { lat: 45.52, lng: -73.57 } }, selfPreferences: null, members: [{ id, submitted: true }, { id: guest, submitted: true }], plan: null, planIndex: 0, optionCount: 0, groupRerollsUsed: 0, votes: 0, voteThreshold: 2, selfVoted: false, noPlanReason: null, venueSource: null };
let client: QueryClient;
function open() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Component = Route.options.component as ComponentType;
  return render(<QueryClientProvider client={client}><Component /></QueryClientProvider>);
}
beforeEach(() => {
  mocks.planning.mockReset(); mocks.party.mockReset(); mocks.navigate.mockReset();
  mocks.party.mockResolvedValue({ code: "ABC123", selfId: id, isHost: true, started: false, view: "team", hangout: null, members: [{ id, name: "Host", host: true, location: null }, { id: guest, name: "Guest", host: false, location: null }] });
  mocks.planning.mockResolvedValue(state);
});
afterEach(() => { cleanup(); client?.clear(); });

describe("Planning screen polling and recovery", () => {
  it("checks guest party access before reading planning", async () => {
    mocks.party.mockRejectedValue(new Error("Join this party")); open();
    await screen.findByText("Let's find your crew."); expect(mocks.planning).not.toHaveBeenCalled();
  });
  it("uses the existing capability only as RPC input, not in cache keys", async () => {
    open(); await screen.findByRole("button", { name: "Lock & find a plan" });
    expect(mocks.planning).toHaveBeenCalledWith({ data: { action: "read", code: "ABC123", token: "a".repeat(64) } });
    expect(client.getQueryCache().getAll().map((entry) => entry.queryKey)).toEqual([["party", "ABC123"], ["party-planning", "ABC123"]]);
  });
  it("shows loading and reads back a completed lock", async () => {
    let finish: ((value: PlanningState) => void) | undefined;
    mocks.planning.mockImplementation(({ data }: { data: { action: string } }) => data.action === "lock" ? new Promise<PlanningState>((resolve) => { finish = resolve; }) : Promise.resolve(state));
    open(); fireEvent.click(await screen.findByRole("button", { name: "Lock & find a plan" }));
    await screen.findByText("Finding your shared plan…");
    mocks.planning.mockImplementation(() => Promise.resolve({ ...state, status: "no_plan", noPlanReason: "no_match" }));
    if (!finish) throw new Error("Lock did not start"); finish({ ...state, status: "no_plan", noPlanReason: "no_match" });
    await screen.findByRole("button", { name: "Reopen planning" });
    expect(mocks.planning.mock.calls.filter(([input]) => input.data.action === "read").length).toBeGreaterThanOrEqual(2);
  });
  it("re-reads after a network failure and keeps private edits", async () => {
    mocks.planning.mockImplementation(({ data }: { data: { action: string } }) => data.action === "save" ? Promise.reject(new Error("network failed")) : Promise.resolve(state));
    open(); const budget = await screen.findByLabelText("My budget"); fireEvent.change(budget, { target: { value: "2" } }); fireEvent.submit(screen.getByRole("form", { name: "My private preferences" }));
    await screen.findByRole("alert"); await waitFor(() => expect(mocks.planning.mock.calls.filter(([input]) => input.data.action === "read").length).toBeGreaterThanOrEqual(2)); expect(budget).toHaveValue("2");
  });
  it("discards private preference cache after leaving the screen", async () => {
    const view = open(); await screen.findByLabelText("My budget"); view.unmount(); await waitFor(() => expect(client.getQueryData(["party-planning", "ABC123"])).toBeUndefined());
  });
  it("refreshes a stale revision before another action", async () => {
    mocks.planning.mockImplementation(({ data }: { data: { action: string } }) => data.action === "lock" ? Promise.reject(new Error("stale revision")) : Promise.resolve(state));
    open(); fireEvent.click(await screen.findByRole("button", { name: "Lock & find a plan" }));
    await screen.findByRole("alert"); await waitFor(() => expect(mocks.planning.mock.calls.filter(([input]) => input.data.action === "read").length).toBeGreaterThanOrEqual(2));
    expect(mocks.planning.mock.calls.filter(([input]) => input.data.action === "lock")).toHaveLength(1);
  });
  it("preserves edits when a background read fails and disables unsafe writes", async () => {
    open(); const budget = await screen.findByLabelText("My budget"); fireEvent.change(budget, { target: { value: "3" } });
    mocks.planning.mockRejectedValue(new Error("network unavailable"));
    await client.invalidateQueries({ queryKey: ["party-planning", "ABC123"] });
    await screen.findByRole("alert"); expect(budget).toHaveValue("3"); expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
  });
});