import { beforeEach, expect, it, vi } from "vitest";
import { readGuestEntry, rememberGuestEntry } from "./guest-entry";

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); vi.restoreAllMocks(); });

it("restores a confirmed guest entry after navigating away and revisiting", () => {
  rememberGuestEntry({ name: "Guest navigator", code: "ABC123" });
  expect(readGuestEntry()).toEqual({ name: "Guest navigator", code: "ABC123" });
});

it("replaces the last lobby reference when a new party is created without replacing its membership credential", () => {
  localStorage.setItem("baggle-guest-membership", "a".repeat(64));
  rememberGuestEntry({ name: "Navigator", code: "ABC123" });
  rememberGuestEntry({ name: "Navigator", code: "DEF456" });
  expect(readGuestEntry()?.code).toBe("DEF456");
  expect(localStorage.getItem("baggle-guest-membership")).toBe("a".repeat(64));
  expect(sessionStorage.getItem("baggle-last-guest-entry")).not.toContain("a".repeat(64));
});

it("ignores malformed or unsafe stored routes", () => {
  for (const raw of ["bad json", JSON.stringify({ name: "Navigator", code: "https://other.test" }), JSON.stringify({ name: "", code: "ABC123" })]) {
    sessionStorage.setItem("baggle-last-guest-entry", raw);
    expect(readGuestEntry()).toBeNull();
  }
});

it("does not overwrite a valid saved entry with invalid input", () => {
  rememberGuestEntry({ name: "Navigator", code: "ABC123" });
  rememberGuestEntry({ name: "", code: "DEF456" });
  expect(readGuestEntry()).toEqual({ name: "Navigator", code: "ABC123" });
});

it("does not block joining when browser storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
  expect(() => rememberGuestEntry({ name: "Navigator", code: "ABC123" })).not.toThrow();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage blocked"); });
  expect(readGuestEntry()).toBeNull();
});