import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: mocks.getSession } } }));
import { PartyHeader } from "./PartyHeader";

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: null } });
});

function mount() {
  const root = createRootRoute({ component: Outlet });
  const index = createRoute({ getParentRoute: () => root, path: "/", validateSearch: (search) => ({ guest: search["guest"] === true || search["guest"] === "true" }), component: () => null });
  const home = createRoute({ getParentRoute: () => root, path: "/home", component: () => null });
  const party = createRoute({ getParentRoute: () => root, path: "/party/$code", component: () => <PartyHeader code="ABC123" /> });
  const router = createRouter({ routeTree: root.addChildren([index, home, party]), history: createMemoryHistory({ initialEntries: ["/party/ABC123"] }) });
  render(<RouterProvider router={router} />);
  return router;
}

it("takes a guest from lobby Back straight to the guest entry screen", async () => {
  const router = mount();
  fireEvent.click(await screen.findByRole("link", { name: "Back" }));
  await waitFor(() => expect(router.state.location.href).toBe("/?guest=true"));
});

it("keeps signed-in lobby Back pointed at the dashboard", async () => {
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "signed-in" } } } });
  const router = mount();
  await screen.findByRole("navigation", { name: "Party navigation" });
  const navigation = within(screen.getByRole("navigation", { name: "Party navigation" }));
  fireEvent.click(await navigation.findByRole("link", { name: "Dashboard" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/home"));
});