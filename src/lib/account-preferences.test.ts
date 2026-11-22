import { describe, expect, it } from "vitest";
import { ageFromBirthDate, emptyPreferences, firstMissingStep, isStepComplete, preferenceSteps, toggleChoice, validBirthDate } from "./account-preferences";

describe("mandatory account preferences", () => {
  const complete = { ...emptyPreferences("user"), username: "Sesame_Sam", date_of_birth: "2004-11-22", tastes: ["Outdoors"], food_preferences: ["Italian"], food_allergies: ["None"], dietary: ["None"], accessibility: ["None"], alcohol: "no_preference" };
  it.each(preferenceSteps)("requires %s before completion", (step) => {
    const key = step === "birth-date" ? "date_of_birth" : step === "food" ? "food_preferences" : step;
    expect(isStepComplete(step, complete)).toBe(true);
    expect(isStepComplete(step, { ...complete, [key]: null })).toBe(false);
  });
  it("resumes at the first unanswered page", () => {
    expect(firstMissingStep(emptyPreferences("user"))).toBe("username");
    expect(firstMissingStep({ ...complete, dietary: null })).toBe("dietary");
    expect(firstMissingStep(complete)).toBeUndefined();
  });
  it("rejects invalid and future dates", () => {
    const today = new Date(2026, 10, 22);
    expect(validBirthDate("2004-02-29", today)).toBe(true);
    expect(validBirthDate("2003-02-29", today)).toBe(false);
    expect(validBirthDate("2026-11-23", today)).toBe(false);
  });
  it("derives age from birthday rather than storing a stale age", () => {
    expect(ageFromBirthDate("2004-11-22", new Date(2026, 10, 21))).toBe(21);
    expect(ageFromBirthDate("2004-11-22", new Date(2026, 10, 22))).toBe(22);
  });
  it("keeps None exclusive for restrictions", () => {
    expect(toggleChoice(["Vegan"], "None")).toEqual(["None"]);
    expect(toggleChoice(["None"], "Vegan")).toEqual(["Vegan"]);
    expect(isStepComplete("dietary", { ...complete, dietary: ["None", "Vegan"] })).toBe(false);
  });
  it("requires an explicit allergy answer on the food page", () => {
    expect(isStepComplete("food", { ...complete, food_allergies: null })).toBe(false);
    expect(isStepComplete("food", { ...complete, food_allergies: ["Peanuts", "Sesame"] })).toBe(true);
    expect(isStepComplete("food", { ...complete, food_allergies: ["None", "Peanuts"] })).toBe(false);
  });
  it("keeps No preference exclusive for food", () => {
    expect(toggleChoice(["Italian"], "No preference", "No preference")).toEqual(["No preference"]);
    expect(isStepComplete("food", { ...complete, food_preferences: ["No preference", "Italian"] })).toBe(false);
  });
  it("requires a valid unique-username format", () => {
    expect(isStepComplete("username", { ...complete, username: "sam" })).toBe(true);
    expect(isStepComplete("username", { ...complete, username: "a b" })).toBe(false);
    expect(isStepComplete("username", { ...complete, username: "ab" })).toBe(false);
  });
});