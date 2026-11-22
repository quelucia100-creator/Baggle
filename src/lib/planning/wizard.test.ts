import { describe, expect, it } from "vitest";
import { preferencesSchema } from "./types";
import {
  draftToPreferences,
  emptyPlanDraft,
  firstIncompletePlanStep,
  hhmmToTimeIndex,
  isPlanStepComplete,
  kmToTravelMin,
  maxStartIndex,
  minGapSteps,
  planSteps,
  timeIndexLabel,
  timeIndexToHHMM,
  TIME_STEPS,
  travelMinToKm,
  vibeCategory,
  vibeOptions,
  type PlanDraft,
} from "./wizard";

const complete: PlanDraft = { budget: 2, freeFrom: "19:00", freeTo: "23:00", km: 5, vibe: "chill" };

describe("time slider helpers", () => {
  it("maps slider steps to Montreal clock times in 30-minute steps", () => {
    expect(timeIndexToHHMM(18 * 60 + 5, 0)).toBe("18:05");
    expect(timeIndexToHHMM(18 * 60 + 5, 3)).toBe("19:35");
  });

  it("wraps the end time past midnight so the solver reads it as the next day", () => {
    expect(timeIndexToHHMM(20 * 60, TIME_STEPS)).toBe("08:00");
    expect(hhmmToTimeIndex(20 * 60, "08:00")).toBe(TIME_STEPS);
  });

  it("keeps the start time before midnight on the event date", () => {
    // 21:00 + 5 steps = 23:30 is the latest start; 6 steps would be 00:00 tomorrow.
    expect(maxStartIndex(21 * 60, 1)).toBe(5);
    expect(timeIndexToHHMM(21 * 60, maxStartIndex(21 * 60, 1)) < "24:00").toBe(true);
    // Early in the day the start is limited by room for the hangout length instead.
    expect(maxStartIndex(9 * 60, 3)).toBe(TIME_STEPS - 3);
    expect(maxStartIndex(23 * 60 + 55, 1)).toBe(0);
  });

  it("requires a gap of at least the hangout length", () => {
    expect(minGapSteps(30)).toBe(1);
    expect(minGapSteps(90)).toBe(3);
    expect(minGapSteps(100)).toBe(4);
  });

  it("returns null for saved times outside the next 12 hours", () => {
    expect(hhmmToTimeIndex(20 * 60, "10:00")).toBeNull();
    expect(hhmmToTimeIndex(20 * 60, "21:00")).toBe(2);
  });
});

describe("travel radius", () => {
  it("converts km with the solver's 4 min/km plus 5 minute base", () => {
    expect(kmToTravelMin(1)).toBe(9);
    expect(kmToTravelMin(5)).toBe(25);
    expect(kmToTravelMin(20)).toBe(85);
  });

  it("clamps to the schema's 5..90 minute range", () => {
    expect(kmToTravelMin(0)).toBe(5);
    expect(kmToTravelMin(50)).toBe(90);
  });

  it("round-trips km through minutes", () => {
    for (let km = 1; km <= 20; km++) expect(travelMinToKm(kmToTravelMin(km))).toBe(km);
    expect(travelMinToKm(90)).toBe(20);
    expect(travelMinToKm(5)).toBe(1);
  });
});

describe("vibe", () => {
  it("maps every vibe to a category the solver supports", () => {
    expect(vibeCategory("chill")).toBe("park");
    expect(vibeCategory("coffee")).toBe("cafe");
    expect(vibeCategory("food")).toBe("restaurant");
    expect(vibeCategory("culture")).toBe("museum");
    expect(vibeCategory("active")).toBe("activity");
    expect(new Set(vibeOptions.map((option) => option.category)).size).toBe(vibeOptions.length);
  });
});

describe("step completion", () => {
  it("orders the steps budget, time, radius, vibe", () => {
    expect(planSteps).toEqual(["budget", "time", "radius", "vibe"]);
  });

  it("finds the first unanswered step", () => {
    expect(firstIncompletePlanStep(emptyPlanDraft)).toBe("budget");
    expect(firstIncompletePlanStep({ ...emptyPlanDraft, budget: 0 })).toBe("time");
    expect(firstIncompletePlanStep({ ...complete, km: null })).toBe("radius");
    expect(firstIncompletePlanStep({ ...complete, vibe: null })).toBe("vibe");
    expect(firstIncompletePlanStep(complete)).toBeNull();
  });

  it("treats a free budget of 0 as answered", () => {
    expect(isPlanStepComplete("budget", { ...emptyPlanDraft, budget: 0 })).toBe(true);
  });
});

describe("draftToPreferences", () => {
  it("produces preferences the backend schema accepts", () => {
    const preferences = draftToPreferences(complete, { lat: 45.50812, lng: -73.56789 });
    expect(preferencesSchema.parse(preferences)).toEqual(preferences);
    expect(preferences).toEqual({
      budget: 2,
      freeFrom: "19:00",
      freeTo: "23:00",
      maxTravelMin: 25,
      originLat: 45.51,
      originLng: -73.57,
    });
  });

  it("uses the party area when no location is shared", () => {
    const preferences = draftToPreferences(complete, null);
    expect(preferences.originLat).toBeNull();
    expect(preferences.originLng).toBeNull();
    expect(preferencesSchema.safeParse(preferences).success).toBe(true);
  });

  it("refuses an incomplete draft", () => {
    expect(() => draftToPreferences({ ...complete, freeTo: null }, null)).toThrow();
  });
});

describe("timeIndexLabel", () => {
  it("labels now, evening and next-day times", () => {
    expect(timeIndexLabel(19 * 60, 0)).toBe("Now");
    expect(timeIndexLabel(19 * 60, 1)).toBe("7:30 PM");
    expect(timeIndexLabel(19 * 60, 12)).toBe("1:00 AM (tomorrow)");
    expect(timeIndexLabel(9 * 60, 6)).toBe("12:00 PM");
  });
});
