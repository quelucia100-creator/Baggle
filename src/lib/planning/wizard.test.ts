import { describe, expect, it } from "vitest";
import { preferencesSchema } from "./types";
import {
  DAY_SLOTS,
  slotLabel,
  dayWindowsFor,
  freeRuns,
  paintSlots,
  windowsToSlots,
  clampFree,
  replaceBlock,
  moveBlock,
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
  dayFree: {},
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
  it("labels grid cell edges from 12 AM to midnight", () => {
    expect(slotLabel(0)).toBe("12:00 AM");
    expect(slotLabel(19)).toBe("9:30 AM");
    expect(slotLabel(DAY_SLOTS)).toBe("Midnight");
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
  it("has the host pick the day first, a step guests skip", () => {
    expect(planSteps).toEqual(["day", "time", "budget", "radius", "vibe"]);
    expect(planStepsFor(true)).toEqual(planSteps);
    expect(planStepsFor(false)).toEqual(["budget", "time", "radius", "vibe"]);
  });

  it("finds the first unanswered step", () => {
    const guest = planStepsFor(false);
    expect(firstIncompletePlanStep(emptyPlanDraft)).toBe("day");
    expect(firstIncompletePlanStep({ ...emptyPlanDraft, day: "today" })).toBe("time");
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

describe("free-time grid", () => {
  const days = ["2026-11-28", "2026-11-29", "2026-11-30"];
  it("paints and erases a dragged range in either direction", () => {
    expect(paintSlots([], 20, 18, true)).toEqual([18, 19, 20]);
    expect(paintSlots([18, 19, 20, 30], 19, 30, false)).toEqual([18]);
    expect(paintSlots([], 46, 60, true)).toEqual([46, 47]);
  });
  it("splits a day into separate free stretches around busy time", () => {
    // 9-11 AM and 3-8 PM, busy at midday.
    const free = [...paintSlots([], 18, 21, true), ...paintSlots([], 30, 39, true)];
    expect(freeRuns(free)).toEqual([
      { from: 18, to: 22 },
      { from: 30, to: 40 },
    ]);
    expect(dayWindowsFor({ "2026-11-28": free }, days)).toEqual({
      "2026-11-28": [
        { freeFrom: "09:00", freeTo: "11:00" },
        { freeFrom: "15:00", freeTo: "20:00" },
      ],
    });
  });
  it("leaves out stretches shorter than the hangout and days with nothing painted", () => {
    const free = [...paintSlots([], 18, 18, true), ...paintSlots([], 30, 33, true)];
    expect(dayWindowsFor({ "2026-11-28": free, "2026-11-29": [] }, days, 3)).toEqual({
      "2026-11-28": [{ freeFrom: "15:00", freeTo: "17:00" }],
    });
  });
  it("saves a stretch reaching midnight as ending at 00:00", () => {
    expect(dayWindowsFor({ "2026-11-28": paintSlots([], 44, 47, true) }, days)).toEqual({
      "2026-11-28": [{ freeFrom: "22:00", freeTo: "00:00" }],
    });
  });
  it("ignores answers for days the host didn't offer", () => {
    expect(dayWindowsFor({ "2026-12-01": [36, 37] }, ["2026-11-28"])).toEqual({});
  });
  it("puts saved windows back on the grid", () => {
    expect(
      windowsToSlots([
        { freeFrom: "09:00", freeTo: "10:00" },
        { freeFrom: "23:00", freeTo: "00:00" },
      ]),
    ).toEqual([18, 19, 46, 47]);
    expect(windowsToSlots([{ freeFrom: "00:00", freeTo: "00:00" }])).toHaveLength(DAY_SLOTS);
  });
});

describe("calendar blocks", () => {
  const morning = paintSlots([], 18, 21, true); // 9-11 AM
  it("resizes a block and keeps it at least half an hour", () => {
    expect(freeRuns(replaceBlock(morning, { from: 18, to: 22 }, { from: 18, to: 26 }))).toEqual([
      { from: 18, to: 26 },
    ]);
    // Dragging the bottom edge up past the top leaves the shortest block, half an hour.
    expect(freeRuns(replaceBlock(morning, { from: 18, to: 22 }, { from: 20, to: 20 }))).toEqual([
      { from: 19, to: 20 },
    ]);
  });
  it("removes a block", () => {
    expect(replaceBlock(morning, { from: 18, to: 22 }, null)).toEqual([]);
  });
  it("moves a block within a day and onto another day, keeping its length", () => {
    const value = { a: morning, b: [] };
    expect(moveBlock(value, "a", { from: 18, to: 22 }, "a", 36)).toEqual({
      a: [36, 37, 38, 39],
      b: [],
    });
    const moved = moveBlock(value, "a", { from: 18, to: 22 }, "b", 46);
    expect(moved).toEqual({ a: [], b: [44, 45, 46, 47] });
  });
  it("leaves a block in place when it's too long for what's left of the day", () => {
    const value = { a: [10, 11, 12, 13] };
    expect(moveBlock(value, "a", { from: 10, to: 14 }, "a", 40, () => 46)).toBe(value);
  });
  it("never lets blocks land in the past", () => {
    expect(clampFree([10, 30, 31], 30)).toEqual([30, 31]);
    expect(moveBlock({ a: morning }, "a", { from: 18, to: 22 }, "a", 0, () => 20)).toEqual({
      a: [20, 21, 22, 23],
    });
    expect(replaceBlock([], { from: 0, to: 0 }, { from: 10, to: 30 }, 24)).toEqual(
      paintSlots([], 24, 29, true),
    );
  });
});
