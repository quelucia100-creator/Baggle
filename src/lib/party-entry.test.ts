import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
import { accessParty } from "./party";
import { readGuestEntry, rememberGuestEntry } from "./guest-entry";

const response = { code: "ABC123", selfId: "self", isHost: false, members: [{ id: "self", name: "Saved guest", host: false }] };
beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear(); localStorage.clear();
  localStorage.setItem("baggle-guest-membership", "a".repeat(64));
  mocks.rpc.mockResolvedValue({ data: response, error: null });
});

it("remembers direct invitation joins using the confirmed member name rather than the submitted name", async () => {
  await accessParty("join", "ABC123", "Different input");
  expect(readGuestEntry()).toEqual({ code: "ABC123", name: "Saved guest" });
  expect(localStorage.getItem("baggle-guest-membership")).toBe("a".repeat(64));
});

it("remembers new party creation through every shared entry point", async () => {
  await accessParty("create", "", "New guest");
  expect(readGuestEntry()).toEqual({ code: "ABC123", name: "Saved guest" });
});

it("does not replace the last entry when a join fails", async () => {
  rememberGuestEntry({ code: "DEF456", name: "Previous guest" });
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "Party not found" } });
  await expect(accessParty("join", "ABC123", "Guest")).rejects.toThrow("Party not found");
  expect(readGuestEntry()?.code).toBe("DEF456");
});

it("does not let background polling overwrite a newer entry", async () => {
  rememberGuestEntry({ code: "DEF456", name: "Previous guest" });
  await accessParty("read", "ABC123");
  expect(readGuestEntry()?.code).toBe("DEF456");
});