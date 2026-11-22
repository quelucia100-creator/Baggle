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

function open(
  step: PlanStep,
  overrides: Partial<{ state: PlanningState; party: PartyState }> = {},
) {
  const goToStep = vi.fn();
  const exit = vi.fn();
  const finish = vi.fn();
  const view = render(
    <PlanWizard
      code="ABC123"
      party={overrides.party ?? party}
      state={overrides.state ?? state}
      step={step}
      goToStep={goToStep}
      exit={exit}
      finish={finish}
    />,
  );
  const rerender = (next: PlanStep) =>
    view.rerender(
      <PlanWizard
        code="ABC123"
        party={overrides.party ?? party}
        state={overrides.state ?? state}
        step={next}
        goToStep={goToStep}
        exit={exit}
        finish={finish}
      />,
    );
  return { goToStep, exit, finish, rerender };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  mocks.runPlanning.mockReset();
  mocks.runPlanning.mockResolvedValue(state);
});
afterEach(cleanup);

describe("Plan the hangout wizard", () => {
  it("asks one question per screen with a budget slider", () => {
    const { goToStep } = open("budget");
    expect(screen.getByRole("heading", { name: "What's your budget?" })).toBeInTheDocument();
    const slider = screen.getByRole("slider", { name: "Budget" });
    expect(screen.getAllByRole("slider")).toHaveLength(1);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(slider).toHaveAttribute("aria-valuetext", "$$, A normal night out");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveAttribute("aria-valuetext", "$$$, A bit fancy");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(goToStep).toHaveBeenCalledWith("time");
  });

  it("needs a vibe card picked before saving", () => {
    sessionStorage.setItem(
      "baggle-plan-draft-ABC123",
      JSON.stringify({ budget: 1, freeFrom: "18:00", freeTo: "22:00", km: 5, vibe: null }),
    );
    open("vibe");
    expect(screen.getByRole("button", { name: "Save my answers" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Getting food" }));
    expect(screen.getByRole("button", { name: "Save my answers" })).toBeEnabled();
  });

  it("returns to the map from the first step and to the previous step after that", () => {
    const first = open("budget");
    fireEvent.click(screen.getByRole("button", { name: "Back to map" }));
    expect(first.exit).toHaveBeenCalled();
    cleanup();
    sessionStorage.setItem(
      "baggle-plan-draft-ABC123",
      JSON.stringify({ budget: 1, freeFrom: null, freeTo: null, km: null, vibe: null }),
    );
    const second = open("time");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(second.goToStep).toHaveBeenCalledWith("budget");
  });

  it("sends deep links to the first unanswered step", async () => {
    const { goToStep } = open("vibe");
    await waitFor(() => expect(goToStep).toHaveBeenCalledWith("budget", true));
  });

  it("lets both ends of the time slider move independently", () => {
    sessionStorage.setItem(
      "baggle-plan-draft-ABC123",
      JSON.stringify({ budget: 1, freeFrom: null, freeTo: null, km: null, vibe: null }),
    );
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

  it("shows a now-to-12-hours window with two labelled thumbs", () => {
    sessionStorage.setItem(
      "baggle-plan-draft-ABC123",
      JSON.stringify({ budget: 1, freeFrom: null, freeTo: null, km: null, vibe: null }),
    );
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

  it("keeps answers across steps and saves rounded preferences on the last step", async () => {
    const { goToStep, finish, rerender } = open("budget");
    fireEvent.keyDown(screen.getByRole("slider", { name: "Budget" }), { key: "Home" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    rerender("time");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    rerender("radius");
    expect(screen.getByText("Up to 5 km (~25 min)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    rerender("vibe");
    expect(
      screen.getByText("The host's pick sets the type of place for the group."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Coffee & chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Save my answers" }));
    await waitFor(() => expect(finish).toHaveBeenCalled());
    expect(goToStep).toHaveBeenCalledWith("vibe");
    expect(mocks.runPlanning).toHaveBeenCalledWith("ABC123", {
      action: "save",
      preferences: {
        budget: 0,
        freeFrom: "18:00",
        freeTo: "06:00",
        maxTravelMin: 25,
        originLat: 45.51,
        originLng: -73.57,
      },
    });
    expect(localStorage.getItem("baggle-plan-vibe-ABC123")).toBe("coffee");
    expect(sessionStorage.getItem("baggle-plan-draft-ABC123")).toBeNull();
  });

  it("keeps the draft when saving fails", async () => {
    mocks.runPlanning.mockRejectedValue(new Error("network down"));
    sessionStorage.setItem(
      "baggle-plan-draft-ABC123",
      JSON.stringify({ budget: 3, freeFrom: "18:00", freeTo: "22:00", km: 7, vibe: "food" }),
    );
    const { finish } = open("vibe");
    fireEvent.click(screen.getByRole("button", { name: "Save my answers" }));
    await waitFor(() => expect(mocks.runPlanning).toHaveBeenCalled());
    expect(finish).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("baggle-plan-draft-ABC123") ?? "{}")).toMatchObject({
      budget: 3,
      km: 7,
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
    expect(screen.getByText("Up to 10 km (~45 min)")).toBeInTheDocument();
  });
});
