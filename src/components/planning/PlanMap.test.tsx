import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { PartyState } from "@/lib/party";
import { PlanMap } from "./PlanMap";

const mocks = vi.hoisted(() => ({ access: vi.fn(), routes: vi.fn(), map: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.routes }));
vi.mock("@/lib/journey-routes.functions", () => ({ getJourneyRoutes: mocks.routes }));
vi.mock("@/lib/party", () => ({
  accessParty: mocks.access,
  membershipToken: () => "a".repeat(64),
}));
vi.mock("@tanstack/react-router", () => ({
  ClientOnly: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/JourneyMap", () => ({
  JourneyMap: (props: unknown) => {
    mocks.map(props);
    return null;
  },
}));

const destination = { lat: 45.52, lng: -73.57, name: "Parc La Fontaine" };
const party: PartyState = {
  code: "ABC123",
  selfId: "host",
  isHost: true,
  started: false,
  view: "team",
  hangout: null,
  members: [
    {
      id: "host",
      name: "Lucia Que",
      host: true,
      location: { lat: 45.5, lng: -73.6, updatedAt: "2026-11-22T15:23:00Z" },
    },
    { id: "guest", name: "Alex", host: false, location: null },
  ],
};
let client: QueryClient;
function open(member = party) {
  client = new QueryClient();
  client.setQueryData(["party", member.code], member);
  return render(
    <QueryClientProvider client={client}>
      <PlanMap party={member} destination={destination} revision={4} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue(party);
  mocks.routes.mockResolvedValue({ revision: 4, destination, routes: [], unavailable: 0 });
});
afterEach(() => {
  cleanup();
  client?.clear();
});

describe("Plan map sharing and routes", () => {
  it("uses only public venue and shared party locations, not private planning origins", () => {
    open();
    expect(mocks.map).toHaveBeenLastCalledWith(expect.objectContaining({ party, destination }));
    expect(mocks.routes).not.toHaveBeenCalled();
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it("requests device sharing only after explicit consent and cleans up the watch", async () => {
    const watch = vi.fn<Geolocation["watchPosition"]>(() => 7);
    const clear = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { watchPosition: watch, clearWatch: clear },
    });
    const view = open({
      ...party,
      members: party.members.map((member) => ({ ...member, location: null })),
    });
    expect(watch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Share live location" }));
    expect(watch).toHaveBeenCalledOnce();
    const success = watch.mock.calls[0]?.[0] as unknown as PositionCallback;
    await act(async () =>
      success({ coords: { latitude: 45.53, longitude: -73.59 } } as GeolocationPosition),
    );
    expect(mocks.access).toHaveBeenCalledWith("location", "ABC123", "", undefined, {
      lat: 45.53,
      lng: -73.59,
    });
    view.unmount();
    expect(clear).toHaveBeenCalledWith(7);
  });
  it("removes the caller's shared location after Stop sharing", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Stop sharing" }));
    await waitFor(() => expect(mocks.access).toHaveBeenCalledWith("clear_location", "ABC123"));
  });
  it("sends capability and travel mode, never caller-supplied coordinates, for optional routes", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Transit" }));
    fireEvent.click(screen.getByRole("button", { name: "Show routes" }));
    await waitFor(() =>
      expect(mocks.routes).toHaveBeenCalledWith({
        data: { code: "ABC123", token: "a".repeat(64), mode: "TRANSIT" },
      }),
    );
  });
  it("discards a route response from a previous revision", async () => {
    mocks.routes.mockResolvedValue({ revision: 3, destination, routes: [], unavailable: 0 });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Show routes" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The plan changed"));
    expect(mocks.map).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ routes: expect.anything() }),
    );
  });
  it("keeps the map usable when routes fail", async () => {
    mocks.routes.mockRejectedValue(new Error("Routes unavailable"));
    open();
    fireEvent.click(screen.getByRole("button", { name: "Show routes" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Routes unavailable"));
    expect(screen.getByRole("button", { name: "Share live location" })).toBeEnabled();
  });
});
