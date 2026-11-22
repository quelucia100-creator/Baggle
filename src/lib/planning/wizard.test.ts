import { describe, expect, it } from "vitest";
import { preferencesSchema } from "./types";
import {
  FULL_DAY,
  dayTimeLabel,
  eventDayWindow,
  budgetLevelToSpend,
  dateToPlanDay,
  draftToPreferences,
  emptyPlanDraft,
  firstIncompletePlanStep,
  hhmmToTimeIndex,
  isPlanStepComplete,
  maxStartIndex,
  minGapSteps,
  planDayToDate,
  planSteps,
  planStepsFor,
  spendLabel,
  spendToBudgetLevel,
  timeIndexLabel,
  timeIndexToHHMM,
  timeMarks,
  timeWindow,
  TIME_STEPS,
  togglePickedDay,
  vibeCategory,
  vibeOptions,
  type PlanDraft,
} from "./wizard";

const complete: PlanDraft = {
  spend: 30,
  day: "today",
  pickedDays: [],
  freeFrom: "19:00",
  freeTo: "23:00",
  travelMin: 25,
  dayTimes: {},
  vibe: "chill",
};

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
  it("saves the event day's vertical window, or nothing when that day doesn't work", () => {
    expect(eventDayWindow({}, "2026-11-28")).toEqual({ freeFrom: "00:00", freeTo: "00:00" });
    expect(
      eventDayWindow({ "2026-11-28": { works: true, from: 18, to: 44 } }, "2026-11-28"),
    ).toEqual({ freeFrom: "09:00", freeTo: "22:00" });
    expect(
      eventDayWindow({ "2026-11-28": { works: false, from: 0, to: 48 } }, "2026-11-28"),
    ).toBeNull();
  });

  it("labels vertical day positions from 12 AM to midnight", () => {
    expect(dayTimeLabel(0)).toBe("12:00 AM");
    expect(dayTimeLabel(19)).toBe("9:30 AM");
    expect(dayTimeLabel(FULL_DAY.steps)).toBe("Midnight");
  });
});

describe("budget in dollars", () => {
  it("maps per-person dollars onto the backend's 0-4 price levels", () => {
    expect(spendToBudgetLevel(0)).toBe(0);
    expect(spendToBudgetLevel(5)).toBe(1);
    expect(spendToBudgetLevel(15)).toBe(1);
    expect(spendToBudgetLevel(20)).toBe(2);
    expect(spendToBudgetLevel(35)).toBe(2);
    expect(spendToBudgetLevel(50)).toBe(3);
    expect(spendToBudgetLevel(75)).toBe(4);
    expect(spendToBudgetLevel(100)).toBe(4);
  });

  it("puts a saved level back on the slider at a matching amount", () => {
    for (let level = 0; level <= 4; level++)
      expect(spendToBudgetLevel(budgetLevelToSpend(level))).toBe(level);
  });

  it("labels the top of the slider as open-ended", () => {
    expect(spendLabel(0)).toBe("$0");
    expect(spendLabel(35)).toBe("$35");
    expect(spendLabel(100)).toBe("$100+");
  });
});

describe("vibe", () => {
  it("maps fixed vibes to categories the solver supports", () => {
    expect(vibeCategory("sporty")).toBe("activity");
    expect(vibeCategory("competitive")).toBe("activity");
    expect(vibeCategory("chill")).toBe("park");
    expect(vibeCategory("eats")).toBe("restaurant");
    expect(vibeCategory("creative")).toBe("museum");
  });

  it("rolls a random supported category for surprise", () => {
    expect(vibeCategory("surprise", () => 0)).toBe("park");
    expect(vibeCategory("surprise", () => 0.25)).toBe("cafe");
    expect(vibeCategory("surprise", () => 0.99)).toBe("activity");
  });

  it("offers six vibes, each with an emoji", () => {
    expect(vibeOptions.map((option) => option.value)).toEqual([
      "sporty",
      "competitive",
      "chill",
      "eats",
      "creative",
      "surprise",
    ]);
    expect(vibeOptions.every((option) => option.emoji.length > 0)).toBe(true);
  });
});

describe("day choice", () => {
  it("gives today a now-to-12h slider and another day an 8 AM to 2 AM slider", () => {
    expect(timeWindow("today", 18 * 60)).toEqual({ baseMin: 18 * 60, steps: 24, isToday: true });
    const other = timeWindow("2026-11-28", 18 * 60);
    expect(other).toEqual({ baseMin: 8 * 60, steps: 36, isToday: false });
    expect(timeIndexLabel(other.baseMin, 0, false)).toBe("8:00 AM");
    expect(timeIndexLabel(other.baseMin, 36, false)).toBe("2:00 AM (next day)");
    expect(timeMarks(other)).toEqual(["8 AM", "2 PM", "8 PM", "2 AM"]);
    expect(timeMarks(timeWindow("today", 0))).toEqual(["Now", "+3h", "+6h", "+9h", "+12h"]);
  });

  it("toggles several picked days and keeps them in date order", () => {
    let picked = togglePickedDay([], "2026-11-28");
    picked = togglePickedDay(picked, "2026-11-24");
    picked = togglePickedDay(picked, "2026-11-26");
    expect(picked).toEqual(["2026-11-24", "2026-11-26", "2026-11-28"]);
    expect(togglePickedDay(picked, "2026-11-24")).toEqual(["2026-11-26", "2026-11-28"]);
  });

  it("converts between the day choice and the shared config date", () => {
    expect(planDayToDate("today", "2026-11-22")).toBe("2026-11-22");
    expect(planDayToDate("2026-11-28", "2026-11-22")).toBe("2026-11-28");
    expect(dateToPlanDay("2026-11-28", "2026-11-22")).toBe("2026-11-28");
    expect(dateToPlanDay("2026-11-22", "2026-11-22")).toBe("today");
    expect(dateToPlanDay("2026-11-01", "2026-11-22")).toBe("today");
  });
});

describe("step completion", () => {
  it("gives the host a day step that guests skip", () => {
    expect(planSteps).toEqual(["budget", "day", "time", "radius", "vibe"]);
    expect(planStepsFor(true)).toEqual(planSteps);
    expect(planStepsFor(false)).toEqual(["budget", "time", "radius", "vibe"]);
  });

  it("finds the first unanswered step", () => {
    const guest = planStepsFor(false);
    expect(firstIncompletePlanStep(emptyPlanDraft)).toBe("budget");
    expect(firstIncompletePlanStep({ ...emptyPlanDraft, spend: 0 })).toBe("day");
    expect(firstIncompletePlanStep({ ...emptyPlanDraft, spend: 0 }, guest)).toBe("time");
    expect(firstIncompletePlanStep({ ...complete, travelMin: null })).toBe("radius");
    expect(firstIncompletePlanStep({ ...complete, vibe: null })).toBe("vibe");
    expect(firstIncompletePlanStep(complete)).toBeNull();
  });

  it("treats a $0 budget as answered", () => {
    expect(isPlanStepComplete("budget", { ...emptyPlanDraft, spend: 0 })).toBe(true);
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
