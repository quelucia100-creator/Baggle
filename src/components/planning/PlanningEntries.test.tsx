import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType, ReactNode } from "react";
import type { PartyState } from "@/lib/party";
import type { PlanningState } from "@/lib/planning/types";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), planning: vi.fn(), party: vi.fn(), invite: vi.fn(), navigate: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.planning }));
vi.mock("@/lib/planning.functions", () => ({ updatePartyPlanning: mocks.planning }));
vi.mock("@/lib/party", () => ({ accessParty: mocks.party, membershipToken: () => "a".repeat(64), MAX_PARTY_MEMBERS: 10, canRemoveMember: () => false }));
vi.mock("@/lib/pending-group-invite", () => ({ hasPendingGroupInvite: () => true, sendPendingGroupInvite: mocks.invite }));
vi.mock("@/components/PartyHeader", () => ({ PartyHeader: () => null }));
vi.mock("@/components/PartyInviteQR", () => ({ PartyInviteQR: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useParams: () => ({ code: "ABC123" }) }),
  useHydrated: () => true,
  useNavigate: () => mocks.navigate,
  Link: ({ children, to, params }: { children: ReactNode; to: string; params?: { code: string } }) =>
    <a href={to.replace("$code", params?.code ?? "")}>{children}</a>,
}));
import { Route } from "@/routes/party.$code";
import { usePartyWorkflow } from "./usePartyWorkflow";
import { HangoutPanel } from "./HangoutPanel";

const hostId = "00000000-0000-4000-8000-000000000001";
const guestId = "00000000-0000-4000-8000-000000000002";
const party: PartyState = {
  code: "ABC123", selfId: hostId, isHost: true, started: false, view: "team", hangout: null,
  members: [{ id: hostId, name: "Host", host: true, location: null }, { id: guestId, name: "Guest", host: false, location: null }],
};
const state: PlanningState = {
  status: "collecting", revision: 1,
  config: { category: "park", date: "2026-11-25", durationMin: 60, areaLabel: "Plateau", area: { lat: 45.52, lng: -73.57 } },
  selfPreferences: null, members: [{ id: hostId, submitted: true }, { id: guestId, submitted: true }],
  plan: null, planIndex: 0, optionCount: 0, groupRerollsUsed: 0, votes: 0, voteThreshold: 2,
  selfVoted: false, noPlanReason: null, venueSource: null,
};
const missing = { data: null, error: { code: "PGRST202", message: "Could not find public.party_plan_days in the schema cache" } };
let client: QueryClient;
function MapPanel({ member }: { member: PartyState }) {
  const workflow = usePartyWorkflow("ABC123", true);
  return <HangoutPanel code="ABC123" party={member} workflow={workflow} isBusy={false}
    pinHangout={async () => true} clearHangout={vi.fn()} />;
}
function open(view: "lobby" | "map", member: PartyState = party) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Component = Route.options.component as ComponentType;
  return render(<QueryClientProvider client={client}>{view === "lobby" ? <Component /> :
    <MapPanel member={member} />
  }</QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear(); sessionStorage.clear();
  mocks.rpc.mockReset().mockResolvedValue(missing);
  mocks.party.mockReset().mockResolvedValue(party);
  mocks.planning.mockReset().mockResolvedValue(state);
  mocks.invite.mockReset().mockResolvedValue(true);
});
afterEach(() => { cleanup(); client?.clear(); });

describe("planning entry compatibility and confirmed readiness", () => {
  it("keeps the QR join form and typed name stable until a confirmed join, then resumes roster polling", async () => {
    let joined = false;
    mocks.party.mockImplementation(async (action: string) => {
      if (action === "join") joined = true;
      if (!joined) throw new Error("Join this party to continue");
      return { ...party, isHost: false, selfId: guestId };
    });
    open("lobby");
    const input = await screen.findByLabelText("Display name");
    input.focus();
    fireEvent.change(input, { target: { value: "QR Guest" } });
    vi.useFakeTimers();
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(6500); });
      expect(mocks.party).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText("Display name")).toBe(input);
      expect(input).toHaveValue("QR Guest");
      expect(input).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
    fireEvent.click(screen.getByRole("button", { name: "Join party" }));
    await screen.findByRole("heading", { name: "Who's in?" });
    expect(mocks.party).toHaveBeenCalledWith("join", "ABC123", "QR Guest");
    const before = mocks.party.mock.calls.length;
    await waitFor(() => expect(mocks.party.mock.calls.length).toBeGreaterThan(before), { timeout: 4500 });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("keeps a QR revisit in the lobby despite a previously saved map view", async () => {
    mocks.party.mockResolvedValue({ ...party, started: true, view: "map" });
    open("lobby");
    await screen.findByRole("button", { name: "Make a Plan" });
    await act(async () => { await client.invalidateQueries({ queryKey: ["party", "ABC123"] }); });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.party.mock.calls.every(([action]) => action === "read")).toBe(true);
  });

  it.each(["42501", "PGRST000", "PGRST202"])("does not unlock lobby invitations on a failed readiness check: %s", async (code) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "Read failed" } });
    open("lobby");
    await screen.findByRole("button", { name: "Check again" });
    expect(screen.queryByRole("button", { name: "Copy code" })).toBeNull();
    expect(mocks.invite).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue(missing);
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await screen.findByRole("button", { name: "Make a Plan" });
    expect(mocks.invite).not.toHaveBeenCalled();
  });

  it("keeps existing V2 planning usable with invitations hidden during a missing RPC", async () => {
    open("lobby");
    expect(await screen.findByRole("button", { name: "Make a Plan" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Copy code" })).toBeNull();
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.party.mock.calls.every(([action]) => action === "read")).toBe(true);
  });

  it("waits for a real host-ready response and ignores previously cached readiness after a failed poll", async () => {
    mocks.rpc.mockResolvedValue({ data: { dates: [], selfWindows: null, hostReady: false }, error: null });
    open("lobby");
    await screen.findByRole("link", { name: "Set up the hangout" });
    expect(mocks.invite).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: { dates: [], selfWindows: null, hostReady: true }, error: null });
    await client.invalidateQueries({ queryKey: ["party-planning-days", "ABC123"] });
    await screen.findByRole("button", { name: "Copy code" });
    await waitFor(() => expect(mocks.invite).toHaveBeenCalledTimes(1));
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Access rejected" } });
    await client.invalidateQueries({ queryKey: ["party-planning-days", "ABC123"] });
    await screen.findByRole("button", { name: "Check again" });
    expect(screen.queryByRole("button", { name: "Copy code" })).toBeNull();
    expect(mocks.invite).toHaveBeenCalledTimes(1);
  });

  it("opens the guest's legacy map entry but never gives them host generation controls", async () => {
    open("map", { ...party, isHost: false, selfId: guestId });
    await screen.findByRole("link", { name: "Edit my answers" });
    expect(screen.queryByRole("button", { name: "Make a Plan" })).toBeNull();
    expect(mocks.planning.mock.calls.every(([input]) => input.data.action === "read")).toBe(true);
  });

  it("blocks map generation on an unknown readiness check and restores it after explicit legacy recovery", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST000", message: "Unavailable" } });
    open("map");
    await screen.findByRole("button", { name: "Check again" });
    expect(screen.queryByRole("button", { name: "Make a Plan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy invite link" })).toBeNull();
    mocks.rpc.mockResolvedValue(missing);
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Make a Plan" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Make a Plan" }));
    await waitFor(() => expect(mocks.planning.mock.calls.filter(([input]) => input.data.action !== "read").map(([input]) => input.data.action)).toEqual(["lock"]));
  });

  it("keeps finalized results available during a days check failure without any planning mutation", async () => {
    mocks.planning.mockResolvedValue({ ...state, status: "final", plan: {
      venue: { placeId: "saved-venue", name: "Saved park", category: "park", priceTier: 0, location: { lat: 45.52, lng: -73.57 }, mapsUrl: "https://www.google.com/maps/search/?api=1&query=Saved+park", outdoor: true },
      startAt: "2026-11-25T18:00:00Z", endAt: "2026-11-25T19:00:00Z", compromise: "Review this option", hoursUnknown: false, weather: null,
    } });
    open("map", { ...party, isHost: false, selfId: guestId });
    await screen.findByRole("link", { name: "Open in Google Maps" });
    expect(mocks.planning.mock.calls.every(([input]) => input.data.action === "read")).toBe(true);
    expect(screen.queryByRole("button", { name: "Check again" })).toBeNull();
  });
});