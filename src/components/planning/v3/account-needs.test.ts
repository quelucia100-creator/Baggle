import { describe, expect, it } from "vitest";
import { accountNeedsFrom } from "./account-needs";

describe("accountNeedsFrom", () => {
  it("maps account dietary and allergy answers to planner tags", () => {
    expect(accountNeedsFrom({ dietary: ["Vegan", "None"], food_allergies: ["Peanuts", "Milk"], accessibility: null }).dietary).toEqual(["dairy_free", "nut_allergy", "vegan"]);
  });
  it("maps account accessibility answers to planner tags", () => {
    expect(accountNeedsFrom({ dietary: null, food_allergies: null, accessibility: ["Step-free access", "Low-noise spaces"] }).accessibility).toEqual(["wheelchair_accessible_entrance"]);
  });
});
