import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyState } from "@/lib/party";
import type { PlanningState } from "@/lib/planning/types";
import type { PlanStep } from "@/lib/planning/wizard";

const mocks = vi.hoisted(() => ({ runPlanning: vi.fn() }));
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
      dayTimes: {},
      ...values,
    }),
  );

function open(
  step: PlanStep,
  overrides: Partial<{ state: PlanningState; party: PartyState }> = {},
) {
  const goToStep = vi.fn();
  const exit = vi.fn();
  const finish = vi.fn();
  const element = (current: PlanStep) => (
    <PlanWizard
      code="ABC123"
      party={overrides.party ?? party}
      state={overrides.state ?? state}
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

  it("shows a now-to-12-hours window with two labelled thumbs", () => {
    draft({ spend: 15 });
    open("time");
    expect(screen.getByRole("slider", { name: "Free from" })).toHaveAttribute(
      "aria-valuetext",
      "Now",
    );
    expect(screen.getByRole("slider", { name: "Free until" })).toHaveAttribute(
      "aria-valuetext",
      "6:00 AM (tomorrow)",
    );
  });

  it("lets both ends of the time slider move independently", () => {
    draft({ spend: 15 });
    open("time");
    const from = screen.getByRole("slider", { name: "Free from" });
    const until = screen.getByRole("slider", { name: "Free until" });
    // Radix moves whichever thumb has focus.
    fireEvent.focus(from);
    fireEvent.keyDown(from, { key: "ArrowRight" });
    fireEvent.keyDown(from, { key: "ArrowRight" });
    expect(from).toHaveAttribute("aria-valuetext", "7:00 PM");
    fireEvent.focus(until);
    fireEvent.keyDown(until, { key: "ArrowLeft" });
    expect(from).toHaveAttribute("aria-valuetext", "7:00 PM");
    expect(until).toHaveAttribute("aria-valuetext", "5:30 AM (tomorrow)");
  });

  it("gives guests a vertical 24-hour slider when the host picked another day", () => {
    draft({ spend: 15 });
    open("time", { state: { ...state, config: { ...state.config, date: "2026-11-28" } } });
    const from = screen.getByRole("slider", { name: "Free from on Saturday, November 28" });
    expect(from).toHaveAttribute("aria-orientation", "vertical");
    expect(from).toHaveAttribute("aria-valuetext", "12:00 AM");
    expect(
      screen.getByRole("slider", { name: "Free until on Saturday, November 28" }),
    ).toHaveAttribute("aria-valuetext", "Midnight");
  });

  it("shows one vertical slider per picked day on one screen and saves the event day", async () => {
    draft({ spend: 50, day: "2026-11-25", pickedDays: ["2026-11-25", "2026-11-28"] });
    const { goToStep, rerender, finish } = open("time", { party: host });
    expect(screen.getAllByRole("slider")).toHaveLength(4);
    // Saturday doesn't work for me; its slider is disabled.
    fireEvent.click(screen.getByRole("button", { name: "Saturday, November 28 works for me" }));
    expect(
      screen.getByRole("button", { name: "Saturday, November 28 works for me" }),
    ).toHaveAttribute("aria-pressed", "false");
    const from = screen.getByRole("slider", { name: "Free from on Wednesday, November 25" });
    fireEvent.focus(from);
    fireEvent.keyDown(from, { key: "PageUp" }); // +10 steps = 5:00 AM
    expect(from).toHaveAttribute("aria-valuetext", "5:00 AM");
    const until = screen.getByRole("slider", { name: "Free until on Wednesday, November 25" });
    fireEvent.focus(until);
    fireEvent.keyDown(until, { key: "PageDown" }); // -10 steps = 7:00 PM
    next();
    expect(goToStep).toHaveBeenCalledWith("radius");
    rerender("radius");
    next();
    rerender("vibe");
    fireEvent.click(screen.getByRole("radio", { name: "Chill" }));
    fireEvent.click(screen.getByRole("button", { name: "Save my answers" }));
    await waitFor(() => expect(finish).toHaveBeenCalled());
    expect(mocks.runPlanning.mock.calls.at(-1)?.[1]).toMatchObject({
      preferences: { freeFrom: "05:00", freeTo: "19:00", maxTravelMin: 30 },
    });
  });

  it("asks to keep the event day ticked while voting between days isn't built yet", () => {
    draft({ spend: 50, day: "2026-11-25", pickedDays: ["2026-11-25", "2026-11-28"] });
    open("time", { party: host });
    fireEvent.click(screen.getByRole("button", { name: "Wednesday, November 25 works for me" }));
    expect(screen.getByRole("status")).toHaveTextContent(/plans are made for Wednesday/);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("keeps answers across steps and saves rounded preferences on the last step", async () => {
    const { goToStep, finish, rerender } = open("budget");
    const budget = screen.getByRole("slider", { name: "Budget per person" });
    fireEvent.focus(budget);
    fireEvent.keyDown(budget, { key: "Home" });
    next();
    rerender("time");
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
        freeTo: "06:00",
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
    fireEvent.click(screen.getByRole("radio", { name: /Pick days/ }));
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
    expect(screen.getByText(/2 days picked/)).toHaveTextContent(
      "for now we'll plan for Wednesday, November 25",
    );
    fireEvent.click(screen.getByRole("button", { name: "Wednesday, November 25" }));
    expect(screen.getByRole("button", { name: "Wednesday, November 25" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    next();
    expect(goToStep).toHaveBeenCalledWith("time");
    expect(JSON.parse(sessionStorage.getItem("baggle-plan-draft-ABC123") ?? "{}")).toMatchObject({
      day: "2026-11-28",
      pickedDays: ["2026-11-28"],
    });
  });

  it("sets the host's picked day on the party before saving their answers", async () => {
    draft({ spend: 50, day: "2026-11-28", freeFrom: "10:00", freeTo: "14:00", travelMin: 35 });
    const { finish } = open("vibe", { party: host });
    fireEvent.click(screen.getByRole("radio", { name: "Sporty" }));
    fireEvent.click(screen.getByRole("button", { name: "Save my answers" }));
    await waitFor(() => expect(finish).toHaveBeenCalled());
    expect(mocks.runPlanning.mock.calls.map(([, command]) => command.action)).toEqual([
      "configure",
      "save",
    ]);
    expect(mocks.runPlanning.mock.calls[0]?.[1]).toEqual({
      action: "configure",
      config: { ...state.config, date: "2026-11-28" },
    });
    expect(mocks.runPlanning.mock.calls[1]?.[1]).toMatchObject({
      preferences: { budget: 3, freeFrom: "10:00", freeTo: "14:00", maxTravelMin: 35 },
    });
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
