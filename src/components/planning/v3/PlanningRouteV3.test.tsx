import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { guestId, hostId, party, v2State, v3State } from "./test-utils";

// MOCKED server function and party RPC: these tests never reach a database.
const mocks = vi.hoisted(() => ({ planning: vi.fn(), party: vi.fn(), navigate: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.planning }));
vi.mock("@/lib/planning.functions", () => ({ updatePartyPlanning: vi.fn() }));
vi.mock("@/lib/party", () => ({ accessParty: mocks.party, membershipToken: () => "b".repeat(64) }));
vi.mock("@/components/PartyHeader", () => ({ PartyHeader: () => null }));
vi.mock("@/components/PartyInviteQR", () => ({
  PartyInviteQR: ({ code }: { code: string }) => <p>Invite {code}</p>,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useParams: () => ({ code: "ABC123" }) }),
  useHydrated: () => true,
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
import { Route } from "@/routes/party.$code_.plan";

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
  mocks.party.mockResolvedValue({ ...party, selfId: guestId, isHost: false });
});
afterEach(() => {
  cleanup();
  client?.clear();
});

describe("Planning route V3 integration", () => {
  it("keeps the current V2 planner by default and offers a labelled, local-only preview", async () => {
    mocks.planning.mockResolvedValue(v2State);
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Preview the new planner" }));
    expect(screen.getByText("New planner preview")).toBeInTheDocument();
    expect(window.location.search).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Back to the current planner" }));
    expect(
      await screen.findByRole("button", { name: "Preview the new planner" }),
    ).toBeInTheDocument();
    expect(mocks.planning.mock.calls.every(([call]) => call.data.action === "read")).toBe(true);
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
    expect(screen.queryByText("New planner preview")).toBeNull();
    answerAll();
    fireEvent.click(screen.getByRole("button", { name: "Save & join the plan" }));
    expect(await screen.findByText("Your answers are saved. You're ready!")).toBeInTheDocument();
    const save = mocks.planning.mock.calls.find(([call]) => call.data.action === "save")![0];
    expect(save.data).toMatchObject({
      action: "save",
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
});
