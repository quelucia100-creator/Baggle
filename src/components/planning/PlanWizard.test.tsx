import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyState } from "@/lib/party";
import type { PlanningState } from "@/lib/planning/types";
import type { PlanStep } from "@/lib/planning/wizard";
import type { PlanningDays } from "@/lib/planning-days";

const mocks = vi.hoisted(() => ({ runPlanning: vi.fn(), runPlanningDays: vi.fn() }));
vi.mock("@/lib/planning-days", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/planning-days")>()),
  runPlanningDays: mocks.runPlanningDays,
}));
vi.mock("@/lib/planning-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/planning-client")>()),
  runPlanning: mocks.runPlanning,
}));
vi.mock("@/lib/planning/tz", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/planning/tz")>()),
  montrealNowMinutes: () => 18 * 60,
  montrealToday: () => "2026-11-22",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { PlanWizard } from "./PlanWizard";

// Radix Slider measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const selfId = "00000000-0000-4000-8000-000000000001";
const party: PartyState = {
  code: "ABC123",
  selfId,
  isHost: false,
  started: true,
  view: "map",
  hangout: null,
  members: [
    {
      id: selfId,
      name: "Me",
      host: false,
      location: { lat: 45.50812, lng: -73.56789, updatedAt: "2026-11-22T18:00:00Z" },
    },
  ],
};
const host: PartyState = { ...party, isHost: true };
const state: PlanningState = {
  status: "collecting",
  revision: 1,
  selfPreferences: null,
  members: [{ id: selfId, submitted: false }],
  config: {
    category: "park",
    date: "2026-11-22",
    durationMin: 90,
    areaLabel: "Plateau",
    area: { lat: 45.52, lng: -73.57 },
  },
  plan: null,
  planIndex: 0,
  optionCount: 0,
  groupRerollsUsed: 0,
  votes: 0,
  voteThreshold: 1,
  selfVoted: false,
  noPlanReason: null,
  venueSource: null,
};
const days: PlanningDays = { dates: [], selfWindows: null, hostReady: true };
const draft = (values: Record<string, unknown>) =>
  sessionStorage.setItem(
    "baggle-plan-draft-ABC123",
    JSON.stringify({
      spend: null,
      day: null,
      pickedDays: [],
      freeFrom: null,
      freeTo: null,
      travelMin: null,
      vibe: null,
      dayFree: {},
      ...values,
    }),
  );

function open(
  step: PlanStep,
  overrides: Partial<{ state: PlanningState; party: PartyState; days: PlanningDays }> = {},
) {
  const goToStep = vi.fn();
  const exit = vi.fn();
  const finish = vi.fn();
  const element = (current: PlanStep) => (
    <PlanWizard
      code="ABC123"
      party={overrides.party ?? party}
      state={overrides.state ?? state}
      days={overrides.days ?? days}
      step={current}
      goToStep={goToStep}
      exit={exit}
      finish={finish}
    />
  );
  const view = render(element(step));
  const rerender = (next: PlanStep) => view.rerender(element(next));
  return { goToStep, exit, finish, rerender };
}
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  mocks.runPlanning.mockReset();
  mocks.runPlanning.mockResolvedValue(state);
  mocks.runPlanningDays.mockReset();
  mocks.runPlanningDays.mockResolvedValue(days);
});
afterEach(cleanup);

describe("Plan the hangout wizard", () => {
  it("asks for a per-person budget in dollars on a slider", () => {
    const { goToStep } = open("budget");
    expect(screen.getByRole("heading", { name: "What's your budget?" })).toBeInTheDocument();
    const slider = screen.getByRole("slider", { name: "Budget per person" });
    expect(screen.queryByRole("radio")).toBeNull();
    expect(slider).toHaveAttribute("aria-valuetext", "$25 per person, A normal night out");
    expect(screen.getByText("Up to $25")).toBeInTheDocument();
    fireEvent.focus(slider);
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveAttribute("aria-valuetext", "$100+ per person, Treat ourselves");
    next();
    expect(goToStep).toHaveBeenCalledWith("time");
  });

  it("needs a vibe card picked before saving", () => {
    draft({ spend: 15, freeFrom: "18:00", freeTo: "22:00", travelMin: 25 });
    open("vibe");
    expect(screen.getByRole("button", { name: "Save my answers" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Getting eats" }));
    expect(screen.getByRole("button", { name: "Save my answers" })).toBeEnabled();
  });

  it("offers six vibes including surprise", () => {
    draft({ spend: 15, freeFrom: "18:00", freeTo: "22:00", travelMin: 25 });
    open("vibe");
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    for (const name of ["Sporty", "Competitive", "Chill", "Getting eats", "Creative", "Surprise"])
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Surprise" }));
    expect(screen.getByText(/We'll roll a random kind of place/)).toBeInTheDocument();
  });

  it("returns to the map from the first step and to the previous step after that", () => {
    const first = open("budget");
    fireEvent.click(screen.getByRole("button", { name: "Back to map" }));
    expect(first.exit).toHaveBeenCalled();
    cleanup();
    draft({ spend: 15 });
    const second = open("time");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(second.goToStep).toHaveBeenCalledWith("budget");
  });

  it("sends deep links to the first unanswered step", async () => {
    const { goToStep } = open("vibe");
    await waitFor(() => expect(goToStep).toHaveBeenCalledWith("budget", true));
  });

  it("sends guests away from the host-only day step", async () => {
    draft({ spend: 15 });
    const { goToStep } = open("day");
    await waitFor(() => expect(goToStep).toHaveBeenCalledWith("time", true));
  });

  const column = (long: string) => screen.getByRole("group", { name: `Free time on ${long}` });
  const freeBlock = (label: RegExp) => screen.getByRole("button", { name: label });

  it("gives a today-only hangout one calendar column for today, with the past shaded off", () => {
    draft({ spend: 15 });
    open("time");
    expect(column("Sunday, November 22")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).toBeNull();
    // It's 6 PM: "free all day" means from now until midnight.
    fireEvent.click(screen.getByRole("button", { name: "Free all day" }));
    expect(freeBlock(/^Free 6:00 PM – Midnight on Sunday/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("gives guests a calendar column per host day, starting with nothing picked", () => {
    draft({ spend: 15 });
    open("time", {
      days: { ...days, dates: ["2026-11-28", "2026-11-29"] },
      state: { ...state, config: { ...state.config, date: "2026-11-28" } },
    });
    expect(column("Saturday, November 28")).toBeInTheDocument();
    expect(column("Sunday, November 29")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Free \d/ })).toBeNull();
    expect(screen.getByText(/Pick at least one day that works for you/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("saves separate morning and evening blocks when the member is busy midday", async () => {
    // 90-minute hangout: 9:00-10:30 AM and 6:00-7:30 PM, nothing at midday.
    draft({
      spend: 50,
      day: "2026-11-25",
      pickedDays: ["2026-11-25"],
      dayFree: { "2026-11-25": [18, 19, 20, 36, 37, 38] },
    });
    const { rerender, finish } = open("time", { party: host });
    expect(freeBlock(/^Free 9:00 AM – 10:30 AM on Wednesday/)).toBeInTheDocument();
    expect(freeBlock(/^Free 6:00 PM – 7:30 PM on Wednesday/)).toBeInTheDocument();
    next();
    rerender("radius");
    next();
    rerender("vibe");
    fireEvent.click(screen.getByRole("radio", { name: "Chill" }));
    fireEvent.click(screen.getByRole("button", { name: "Save my answers" }));
    await waitFor(() => expect(finish).toHaveBeenCalled());
    expect(mocks.runPlanningDays.mock.calls.map(([, command]) => command)).toEqual([
      {
        action: "configure",
        dates: ["2026-11-25"],
        windows: {
          "2026-11-25": [
            { freeFrom: "09:00", freeTo: "10:30" },
            { freeFrom: "18:00", freeTo: "19:30" },
          ],
        },
      },
    ]);
    expect(mocks.runPlanning.mock.calls.at(-1)?.[1]).toMatchObject({
      preferences: { freeFrom: "09:00", freeTo: "10:30" },
    });
  });

  it("doesn't count a block shorter than the hangout", () => {
    draft({
      spend: 50,
      day: "2026-11-25",
      pickedDays: ["2026-11-25"],
      dayFree: { "2026-11-25": [18] },
    });
    open("time", { party: host });
    expect(freeBlock(/too short for the hangout/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("works across several offered days and needs at least one that works", () => {
    draft({ spend: 50, day: "2026-11-25", pickedDays: ["2026-11-25", "2026-11-28"] });
    open("time", { party: host });
    fireEvent.click(screen.getByRole("button", { name: "Saturday, November 28" }));
    fireEvent.click(screen.getByRole("button", { name: "Free all day" }));
    expect(screen.getByRole("button", { name: "Saturday, November 28, free" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Clear day" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("makes guests wait until the host has finished setting up", () => {
    const { exit } = open("budget", { days: { ...days, hostReady: false } });
    expect(
      screen.getByRole("heading", { name: "The host is still setting up" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("slider")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to map" }));
    expect(exit).toHaveBeenCalled();
  });

  it("shows guests every day the host offered and saves only the days that work", async () => {
    draft({ spend: 15, travelMin: 25, vibe: "chill" });
    const offered = { ...days, dates: ["2026-11-28", "2026-11-29"] };
    const { finish, rerender } = open("time", {
      days: offered,
      state: { ...state, config: { ...state.config, date: "2026-11-28" } },
    });
    expect(screen.getByRole("button", { name: "Saturday, November 28" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sunday, November 29" }));
    fireEvent.click(screen.getByRole("button", { name: "Free all day" }));
    next();
    rerender("radius");
    next();
    rerender("vibe");
    fireEvent.click(screen.getByRole("button", { name: "Save my answers" }));
    await waitFor(() => expect(finish).toHaveBeenCalled());
    expect(mocks.runPlanningDays.mock.calls.map(([, command]) => command)).toEqual([
      { action: "save", windows: { "2026-11-29": [{ freeFrom: "00:00", freeTo: "00:00" }] } },
    ]);
  });

  it("puts saved blocks back on the calendar for editing", () => {
    open("time", {
      days: {
        ...days,
        dates: ["2026-11-28"],
        selfWindows: { "2026-11-28": [{ freeFrom: "09:00", freeTo: "11:00" }] },
      },
      state: { ...state, config: { ...state.config, date: "2026-11-28" } },
    });
    expect(
      screen.getByRole("button", { name: /^Free 9:00 AM – 11:00 AM on Saturday/ }),
    ).toBeInTheDocument();
  });

  it("warns the host that changing the days resets friends who already answered", () => {
    draft({ spend: 15, day: "2026-11-25", pickedDays: ["2026-11-25"] });
    open("day", {
      party: host,
      days: { ...days, dates: ["2026-11-25"] },
      state: {
        ...state,
        members: [
          { id: selfId, submitted: true },
          { id: "00000000-0000-4000-8000-000000000002", submitted: true },
        ],
      },
    });
    expect(screen.queryByText(/asks the 1 friend/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Saturday, November 28" }));
    expect(screen.getByText(/asks the 1 friend who already answered/)).toBeInTheDocument();
  });

  it("keeps answers across steps and saves rounded preferences on the last step", async () => {
    const { goToStep, finish, rerender } = open("budget");
    const budget = screen.getByRole("slider", { name: "Budget per person" });
    fireEvent.focus(budget);
    fireEvent.keyDown(budget, { key: "Home" });
    next();
    rerender("time");
    // An older today-only party (no offered days stored): one column for today.
    fireEvent.click(screen.getByRole("button", { name: "Free all day" }));
    next();
    rerender("radius");
    expect(screen.getByText("Up to 30 min")).toBeInTheDocument();
    next();
    rerender("vibe");
    expect(
      screen.getByText("The host's pick sets the type of place for the group."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Getting eats" }));
    fireEvent.click(screen.getByRole("button", { name: "Save my answers" }));
    await waitFor(() => expect(finish).toHaveBeenCalled());
    expect(goToStep).toHaveBeenCalledWith("vibe");
    expect(mocks.runPlanning).toHaveBeenCalledTimes(1);
    expect(mocks.runPlanning).toHaveBeenCalledWith("ABC123", {
      action: "save",
      preferences: {
        budget: 0,
        freeFrom: "18:00",
        freeTo: "00:00",
        maxTravelMin: 30,
        originLat: 45.51,
        originLng: -73.57,
      },
    });
    expect(localStorage.getItem("baggle-plan-vibe-ABC123")).toBe("eats");
    expect(sessionStorage.getItem("baggle-plan-draft-ABC123")).toBeNull();
  });

  it("lets the host pick today or several days in the next week", () => {
    draft({ spend: 15 });
    const { goToStep } = open("day", { party: host });
    expect(screen.getByRole("heading", { name: "When's the hangout?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Pick one or more days/ }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    const days = screen.getAllByRole("button", { name: /day, (November|December) / });
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveAccessibleName("Monday, November 23");
    fireEvent.click(screen.getByRole("button", { name: "Saturday, November 28" }));
    fireEvent.click(screen.getByRole("button", { name: "Wednesday, November 25" }));
    expect(screen.getByRole("button", { name: "Saturday, November 28" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Wednesday, November 25" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(/2 days offered/)).toHaveTextContent(
      "Everyone picks which ones work for them.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Wednesday, November 25" }));
    expect(screen.getByRole("button", { name: "Wednesday, November 25" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    next();
    expect(goToStep).toHaveBeenCalledWith("budget");
    expect(JSON.parse(sessionStorage.getItem("baggle-plan-draft-ABC123") ?? "{}")).toMatchObject({
      day: "2026-11-28",
      pickedDays: ["2026-11-28"],
    });
  });

  it("offers the host's picked day to the party before saving their answers", async () => {
    draft({
      spend: 50,
      day: "2026-11-28",
      pickedDays: ["2026-11-28"],
      freeFrom: "10:00",
      freeTo: "14:00",
      travelMin: 35,
      dayFree: { "2026-11-28": [20, 21, 22, 23, 24, 25, 26, 27] },
    });
    const { finish } = open("vibe", { party: host });
    fireEvent.click(screen.getByRole("radio", { name: "Sporty" }));
    fireEvent.click(screen.getByRole("button", { name: "Save my answers" }));
    await waitFor(() => expect(finish).toHaveBeenCalled());
    expect(mocks.runPlanningDays.mock.calls.map(([, command]) => command)).toEqual([
      {
        action: "configure",
        dates: ["2026-11-28"],
        windows: { "2026-11-28": [{ freeFrom: "10:00", freeTo: "14:00" }] },
      },
    ]);
    expect(mocks.runPlanning.mock.calls.map(([, command]) => command.action)).toEqual(["save"]);
    expect(mocks.runPlanning.mock.calls[0]?.[1]).toMatchObject({
      preferences: { budget: 3, freeFrom: "10:00", freeTo: "14:00", maxTravelMin: 35 },
    });
  });

  it("offers today as the only day for a today-only hangout", async () => {
    draft({
      spend: 50,
      day: "today",
      freeFrom: "18:00",
      freeTo: "20:00",
      travelMin: 35,
      // A block that started earlier today is trimmed to now (6 PM).
      dayFree: { "2026-11-22": [34, 35, 36, 37, 38, 39] },
    });
    const { finish } = open("vibe", { party: host });
    fireEvent.click(screen.getByRole("radio", { name: "Sporty" }));
    fireEvent.click(screen.getByRole("button", { name: "Save my answers" }));
    await waitFor(() => expect(finish).toHaveBeenCalled());
    expect(mocks.runPlanningDays.mock.calls.map(([, command]) => command)).toEqual([
      {
        action: "configure",
        dates: ["2026-11-22"],
        windows: { "2026-11-22": [{ freeFrom: "18:00", freeTo: "20:00" }] },
      },
    ]);
  });

  it("starts the host on the day question", async () => {
    const { goToStep } = open("budget", { party: host });
    await waitFor(() => expect(goToStep).toHaveBeenCalledWith("day", true));
  });

  it("keeps the draft when saving fails", async () => {
    mocks.runPlanning.mockRejectedValue(new Error("network down"));
    draft({ spend: 50, freeFrom: "18:00", freeTo: "22:00", travelMin: 35, vibe: "eats" });
    const { finish } = open("vibe");
    fireEvent.click(screen.getByRole("button", { name: "Save my answers" }));
    await waitFor(() => expect(mocks.runPlanning).toHaveBeenCalled());
    expect(finish).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("baggle-plan-draft-ABC123") ?? "{}")).toMatchObject({
      spend: 50,
      travelMin: 35,
    });
  });

  it("pre-fills saved answers for editing", () => {
    open("radius", {
      state: {
        ...state,
        selfPreferences: {
          budget: 2,
          freeFrom: "19:00",
          freeTo: "23:00",
          maxTravelMin: 45,
          originLat: null,
          originLng: null,
        },
      },
    });
    expect(screen.getByText("Up to 45 min")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Longest trip in minutes" })).toHaveAttribute(
      "aria-valuetext",
      "45 minutes one way",
    );
  });
});
