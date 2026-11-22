import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
import { GroupOpenings } from "./GroupOpenings";
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><GroupOpenings groupId="study-crew" /></QueryClientProvider>);
  return client;
}
const shared = { ok: true, openings: [{ weekday: 1, startSlot: 34, endSlot: 36 }], canPoke: true };

it("sends the chosen weekday and waits for a confirmed response before enabling another poke", async () => {
  let complete: ((value: unknown) => void) | undefined;
  mocks.rpc.mockImplementation((_name: string, args: { p_action: string }) => args.p_action === "read"
    ? Promise.resolve({ data: shared, error: null })
    : new Promise((resolve) => { complete = resolve; }));
  const client = mount();
  const button = await screen.findByRole("button", { name: "Poke group for Monday" });
  fireEvent.click(button);
  await waitFor(() => expect(button).toBeDisabled());
  expect(mocks.rpc).toHaveBeenCalledWith("group_weekly_action", { p_action: "poke", p_group: "study-crew", p_weekday: 1 });
  if (!complete) throw new Error("Missing pending response");
  complete({ data: { ok: true }, error: null });
  await waitFor(() => expect(button).toBeEnabled());
  expect(client.getQueryData(["group-openings", "study-crew"])).toEqual(shared);
  client.clear();
});

it("does not offer pokes without any verified shared opening", async () => {
  mocks.rpc.mockResolvedValue({ data: { ok: true, openings: [], canPoke: true }, error: null });
  const client = mount();
  await waitFor(() => expect(client.getQueryData(["group-openings", "study-crew"])).toBeDefined());
  expect(screen.queryByRole("button", { name: /Poke group/ })).toBeNull();
  client.clear();
});

it("disables pokes when the server reports the group cooldown", async () => {
  mocks.rpc.mockResolvedValue({ data: { ...shared, canPoke: false }, error: null });
  const client = mount();
  expect(await screen.findByRole("button", { name: "Poke group for Monday" })).toBeDisabled();
  client.clear();
});

it("shows an error rather than success if the opening disappeared before sending", async () => {
  mocks.rpc.mockImplementation((_name: string, args: { p_action: string }) => Promise.resolve({
    data: args.p_action === "read" ? shared : { ok: false, error: "no_opening" }, error: null,
  }));
  const client = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Poke group for Monday" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(client.getMutationCache().getAll()[0]?.state.status).toBe("error");
  client.clear();
});