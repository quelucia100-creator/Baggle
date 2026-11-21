import { describe, it, expect } from "vitest";
import { isStrongPassword, normalizePartyCode } from "./password";

describe("password rules", () => {
  it("accepts a strong password", () => expect(isStrongPassword("Bagels4Ever!")).toBe(true));
  it("rejects short passwords", () => expect(isStrongPassword("Ab1!")).toBe(false));
  it("requires a symbol", () => expect(isStrongPassword("Bagels4Everr")).toBe(false));
  it("requires a number", () => expect(isStrongPassword("BagelsEver!!")).toBe(false));
});
describe("party code", () => {
  it("cleans input to 6 uppercase chars", () => expect(normalizePartyCode("ab-c12 xyz")).toBe("ABC12X"));
});
