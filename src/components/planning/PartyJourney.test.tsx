import { useState, type ComponentType, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyState } from "@/lib/party";
import type { PlanningState } from "@/lib/planning/types";
vi.mock("./PlanMap", () => ({ PlanMap: () => null }));

const m = vi.hoisted(() => ({
  party: vi.fn(),
  plan: vi.fn(),
  rpc: vi.fn(),
  navigate: vi.fn(),
  search: {} as Record<string, unknown>,
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: m.rpc, auth: { getSession: async () => ({ data: { session: {} } }) } },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => m.plan }));
vi.mock("@/lib/planning.functions", () => ({ updatePartyPlanning: m.plan }));
vi.mock("@/lib/party", () => ({
  accessParty: m.party,
  membershipToken: () => "a".repeat(64),
  canRemoveMember: () => false,
  MAX_PARTY_MEMBERS: 10,
}));
vi.mock("@/lib/account-preferences", () => ({
  accountPreferencesQuery: () => ({
    queryKey: ["account-preferences"],
    queryFn: async () => ({ preferences: { username: "Account Guest" } }),
  }),
}));
vi.mock("@/lib/notifications", () => ({
  notificationsQuery: () => ({ queryKey: ["notifications"], queryFn: async () => [] }),
}));
vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/components/PartyInviteQR", () => ({ PartyInviteQR: () => <p>Invitation QR</p> }));
vi.mock("@/lib/planning/tz", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/planning/tz")>()),
  montrealNowMinutes: () => 18 * 60,
  montrealToday: () => "2026-11-22",
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ code: "ABC123" }),
    useSearch: () => m.search,
  }),
  useHydrated: () => true,
  useNavigate: () => m.navigate,
  Link: ({
    children,
    to,
    search,
    className,
  }: {
    children: ReactNode;
    to: string;
    search?: unknown;
    className?: string;
  }) => (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        m.navigate({ to, search, params: { code: "ABC123" } });
      }}
    >
      {children}
    </a>
  ),
}));
import { Route as Lobby } from "@/routes/party.$code";
import { Route as Planner } from "@/routes/party.$code_.plan";
import { Route as Dashboard } from "@/routes/_authenticated/home";
import { Route as Join } from "@/routes/_authenticated/journey.join.$code";

const code = "ABC123";
const dates = ["2026-11-24", "2026-11-26"];
const host = { id: "host", name: "Host", host: true, location: null };
const guest = { id: "guest", name: "Account Guest", host: false, location: null };
const config = {
  category: "park" as const,
  date: "2026-11-22",
  durationMin: 60,
  areaLabel: "Plateau",
  area: { lat: 45.52, lng: -73.57 },
};
type RouteName = "/home" | "/journey/join/$code" | "/party/$code" | "/party/$code/plan";
const components = {
  "/home": Dashboard.options.component,
  "/journey/join/$code": Join.options.component,
  "/party/$code": Lobby.options.component,
  "/party/$code/plan": Planner.options.component,
};
type Location = { to: RouteName; search?: Record<string, unknown>; replace?: boolean };

let hostReady: boolean;
let guestReady: boolean;
let joined: boolean;
let viewer: typeof host | typeof guest;
let status: PlanningState["status"];
let client: QueryClient;
let finishLock: () => void;
function party(): PartyState {
  return {
    code,
    selfId: viewer.id,
    isHost: viewer.host,
    started: false,
    view: "team",
    hangout: null,
    members: joined ? [host, guest] : [host],
  };
}
function state(): PlanningState {
  return {
    status,
    config,
    revision: hostReady ? 2 : 1,
    members: party().members.map(({ id, host }) => ({
      id,
      submitted: host ? hostReady : guestReady,
    })),
    selfPreferences: null,
    plan: null,
    planIndex: 0,
    optionCount: 0,
    groupRerollsUsed: 0,
    votes: 0,
    voteThreshold: 2,
    selfVoted: false,
    noPlanReason: status === "no_plan" ? "no_match" : null,
    venueSource: null,
  };
}
const days = () => ({
  data: {
    dates: hostReady ? dates : [],
    hostReady,
    selfWindows: null,
    schemaVersion: 2,
    revision: state().revision,
  },
  error: null,
});

function open(initial: Location) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Flow() {
    const [location, setLocation] = useState(initial);
    m.navigate.mockImplementation(async (next: Location) => {
      setLocation(next);
    });
    m.search = location.search ?? {};
    const Screen = components[location.to] as ComponentType;
    return <Screen />;
  }
  return render(
    <QueryClientProvider client={client}>
      <Flow />
    </QueryClientProvider>,
  );
}
async function advanceTo(heading: string) {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: heading });
}
function save() {
  fireEvent.click(screen.getByRole("radio", { name: "Getting eats" }));
  fireEvent.click(screen.getByRole("button", { name: "Save my answers" }));
}
function expectOnlyCandidateColumns() {
  expect(
    screen
      .getAllByRole("group", { name: /^Free time on / })
      .map((column) => column.getAttribute("aria-label")),
  ).toEqual(["Free time on Tuesday, November 24", "Free time on Thursday, November 26"]);
}

beforeEach(() => {
  vi.clearAllMocks();
  hostReady = guestReady = joined = false;
  viewer = host;
  status = "collecting";
  localStorage.clear();
  sessionStorage.clear();
  window.scrollTo = vi.fn();
  m.party.mockImplementation(async (action: string) => {
    if (action === "join") joined = true;
    return party();
  });
  m.plan.mockImplementation(async ({ data }: { data: { action: string } }) => {
    if (data.action === "lock") {
      await new Promise<void>((resolve) => {
        finishLock = resolve;
      });
      status = "no_plan";
    }
    return state();
  });
  m.rpc.mockImplementation(async (_name, args: { p_action: string }) => {
    if (args.p_action === "configure") hostReady = true;
    if (args.p_action === "save") guestReady = true;
    return days();
  });
});
afterEach(() => {
  cleanup();
  client?.clear();
});
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("host-first party workflow", () => {
  it("does not expose invitations even when readiness errors", async () => {
    m.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Could not read readiness" },
    });
    open({ to: "/party/$code" });
    await screen.findByRole("alert");
    expect(screen.queryByText(code)).toBeNull();
    expect(screen.queryByText("Copy link")).toBeNull();
    expect(screen.queryByText("Invitation QR")).toBeNull();
  });

  it("saves host and guest answers, locks once, and restores the server's no-match screen", async () => {
    let hostView = open({ to: "/party/$code" });
    fireEvent.click(await screen.findByRole("link", { name: "Set up the hangout" }));
    await screen.findByRole("heading", { name: "When's the hangout?" });
    expect(screen.queryByText(code)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Pick one or more days/ }));
    fireEvent.click(screen.getByRole("button", { name: "Tuesday, November 24" }));
    fireEvent.click(screen.getByRole("button", { name: "Thursday, November 26" }));
    await advanceTo("When are you free?");
    expectOnlyCandidateColumns();
    expect(m.rpc.mock.calls.every(([, input]) => input.p_action === "read")).toBe(true);
    hostView.unmount();
    client.clear();
    hostView = open({ to: "/party/$code/plan", search: { step: "time" } });
    await screen.findByRole("heading", { name: "When are you free?" });
    expectOnlyCandidateColumns();
    fireEvent.click(screen.getByRole("button", { name: "Free all day" }));
    await advanceTo("What's your budget?");
    await advanceTo("How far will you go?");
    await advanceTo("What's the vibe?");
    save();
    expect(await screen.findByText("Invitation QR")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make a Plan" })).toBeDisabled();
    expect(m.rpc).toHaveBeenCalledWith(
      "party_plan_days",
      expect.objectContaining({
        p_action: "configure",
        p_payload: expect.objectContaining({ dates, category: "restaurant", expectedRevision: 1 }),
      }),
    );
    hostView.unmount();
    client.clear();

    viewer = guest;
    const guestView = open({ to: "/home" });
    fireEvent.change(await screen.findByLabelText("Party code or invite link"), {
      target: { value: new URL("/party/abc123", window.location.origin).href },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join party" }));
    const choose = await screen.findByRole("link", { name: "Choose preferences" });
    expect(choose).toHaveClass("min-h-12");
    expect(m.party.mock.calls.filter(([action]) => action === "join")).toEqual([
      ["join", code, "Account Guest"],
    ]);
    expect(screen.queryByRole("button", { name: "Make a Plan" })).toBeNull();
    fireEvent.click(choose);
    await screen.findByRole("heading", { name: "What's your budget?" });
    await advanceTo("When are you free?");
    expectOnlyCandidateColumns();
    fireEvent.click(screen.getByRole("button", { name: "Thursday, November 26" }));
    fireEvent.click(screen.getByRole("button", { name: "Free all day" }));
    await advanceTo("How far will you go?");
    await advanceTo("What's the vibe?");
    save();
    await screen.findByRole("heading", { name: "The crew starts here." });
    expect(m.toast.success).toHaveBeenCalledTimes(2);
    expect(m.rpc).toHaveBeenCalledWith(
      "party_plan_days",
      expect.objectContaining({
        p_action: "save",
        p_payload: expect.objectContaining({
          expectedRevision: 2,
          windows: { "2026-11-26": [{ freeFrom: "00:00", freeTo: "00:00" }] },
        }),
      }),
    );
    await act(async () => {
      await m.navigate({ to: "/party/$code/plan", search: { step: "radius" } });
    });
    await screen.findByRole("heading", { name: "Your shared hangout" });
    expect(screen.queryByRole("heading", { name: "How far will you go?" })).toBeNull();
    expect(m.navigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "/party/$code/plan", search: {}, replace: true }),
    );
    guestView.unmount();
    client.clear();

    viewer = host;
    const lockView = open({ to: "/party/$code" });
    const lock = await screen.findByRole("button", { name: "Make a Plan" });
    fireEvent.click(lock);
    fireEvent.click(lock);
    await screen.findByRole("button", { name: "Finding your shared plan…" });
    await act(async () => finishLock());
    await screen.findByRole("button", { name: "Reopen planning" });
    const mutations = m.plan.mock.calls
      .map(([call]) => call.data.action)
      .filter((action) => action !== "read");
    expect(mutations).toEqual(["lock"]);
    lockView.unmount();
    client.clear();

    open({ to: "/party/$code/plan", search: { step: "vibe" } });
    await screen.findByRole("button", { name: "Reopen planning" });
    await waitFor(() =>
      expect(m.navigate).toHaveBeenCalledWith(
        expect.objectContaining({ search: {}, replace: true }),
      ),
    );
    expect(screen.queryByRole("heading", { name: "What's the vibe?" })).toBeNull();
  });
});
