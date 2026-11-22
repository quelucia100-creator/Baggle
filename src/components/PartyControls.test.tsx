import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PartyState } from "@/lib/party";
const m = vi.hoisted(() => ({ call: vi.fn(), navigate: vi.fn(), session: null as null | { user: { id: string } } }));
vi.mock("@/lib/party-social", () => ({ partySocial: m.call }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: m.session } }) } } }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => m.navigate }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn() } }));
import { PartyControls } from "./PartyControls";
const party: PartyState = { code: "ABC123", selfId: "self", isHost: false, started: false, view: "team", hangout: null, members: [{ id: "self", host: false, name: "Me", location: null }, { id: "other", host: true, name: "Other", location: null }] };
let client: QueryClient;
function open(host = false) { client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); render(<QueryClientProvider client={client}><PartyControls party={{ ...party, isHost: host }} /></QueryClientProvider>); }
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); m.session = null; m.call.mockResolvedValue({ ok: true }); });
afterEach(() => { cleanup(); client?.clear(); });
it("requires confirmation, awaits a real leave response, and clears only this party's cache", async () => {
  let finish: (value: { ok: boolean }) => void = () => {};
  m.call.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  open(); client.setQueryData(["party", "ABC123"], party); client.setQueryData(["party", "OTHER1"], party);
  fireEvent.click(screen.getByRole("button", { name: "Leave party" }));
  expect(m.call).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("dialog").querySelectorAll("button")[1] as HTMLButtonElement);
  expect(m.navigate).not.toHaveBeenCalled();
  finish({ ok: true });
  await waitFor(() => expect(m.navigate).toHaveBeenCalledWith({ to: "/", search: { guest: true }, replace: true }));
  expect(client.getQueryData(["party", "ABC123"])).toBeUndefined();
  expect(client.getQueryData(["party", "OTHER1"])).toEqual(party);
});
it("offers disbanding only to the host and retains the party after an unconfirmed response", async () => {
  open(); expect(screen.queryByRole("button", { name: "Disband party" })).toBeNull(); cleanup(); client.clear(); open(true);
  m.call.mockResolvedValue({ ok: false });
  fireEvent.click(screen.getByRole("button", { name: "Disband party" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Disband party" })[1] as HTMLButtonElement);
  await screen.findByRole("alert"); expect(m.navigate).not.toHaveBeenCalled(); expect(m.call).toHaveBeenCalledWith("disband", "ABC123");
});
it("sends friendship requests only to server-confirmed registered party members", async () => {
  m.session = { user: { id: "account" } };
  m.call.mockImplementation(async (action: string) => action === "list" ? { ok: true, items: [{ memberId: "other", username: "verified-account", relationship: "none" }] } : { ok: true, result: "requested" });
  open(); fireEvent.click(await screen.findByRole("button", { name: "Add friend" }));
  await waitFor(() => expect(m.call).toHaveBeenCalledWith("request", "ABC123", "other"));
  expect(m.call).toHaveBeenCalledWith("attach", "ABC123");
});
it("never offers guest-to-account friend requests", () => { open(); expect(screen.queryByRole("button", { name: "Add friend" })).toBeNull(); expect(m.call).not.toHaveBeenCalled(); });