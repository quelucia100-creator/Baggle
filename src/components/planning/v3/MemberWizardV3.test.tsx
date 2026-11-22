import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { emptyMemberDraft, type MemberDraft } from "./member-model";
import { MEMBER_STEPS } from "./member-model";
import { NOW, TODAY, MemberHarness, calendarContext, installPointerEvent } from "./test-utils";

// These flows render large accessible grids; role queries are slow under a parallel run.
vi.setConfig({ testTimeout: 20_000 });
beforeAll(installPointerEvent);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const step = (name: (typeof MEMBER_STEPS)[number]) => MEMBER_STEPS.indexOf(name);
const filled: MemberDraft = {
  ...emptyMemberDraft(),
  vibes: ["chill_cozy"],
  likedActivities: ["food_cafes"],
  preferredMinCad: 0,
  preferredMaxCad: 15,
  ceiling: { kind: "cap", cad: 25 },
  days: {
    "2026-11-24": { busy: [36, 37], confirmed: true },
    "2026-11-26": { busy: [], confirmed: true },
  },
  origin: { source: "manual", label: "Verdun", lat: 45.46, lng: -73.57 },
  travelMode: "walk",
  maxOneWayMinutes: 20,
};

describe("Vibe and activities", () => {
  it("allows one or two distinct vibes with pressed state", () => {
    render(<MemberHarness save={vi.fn()} />);
    next();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose at least one vibe.");
    const chill = screen.getByRole("button", { name: "Chill & cozy" });
    fireEvent.click(chill);
    fireEvent.click(screen.getByRole("button", { name: "Creative" }));
    expect(chill).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Competitive" })).toBeDisabled();
    expect(screen.getByText(/2\/2 chosen/)).toBeInTheDocument();
    next();
    expect(screen.getByRole("heading", { name: "What sounds fun?" })).toBeInTheDocument();
  });

  it("keeps likes and up to three hard no's disjoint, with conditional food questions", () => {
    render(<MemberHarness save={vi.fn()} initialStep={step("activities")} />);
    fireEvent.click(screen.getByRole("button", { name: "Games" }));
    expect(screen.getByRole("button", { name: "Never Games" })).toBeDisabled();
    for (const activity of ["Sports", "Outdoors", "Nightlife"])
      fireEvent.click(screen.getByRole("button", { name: `Never ${activity}` }));
    expect(screen.getByRole("button", { name: "Never Entertainment" })).toBeDisabled();
    expect(screen.getByText("Food needs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Never Nightlife" }));
    fireEvent.click(screen.getByRole("button", { name: "Never Food & cafés" }));
    expect(screen.queryByText("Food needs")).toBeNull();
    expect(screen.getByText("Accessibility needs")).toBeInTheDocument();
  });
});

describe("Budget", () => {
  it("applies reversible presets, keeps bounds ordered and requires an explicit ceiling", () => {
    render(
      <MemberHarness
        save={vi.fn()}
        initialStep={step("budget")}
        initial={{ ...filled, ceiling: null }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "$30–50" }));
    expect(screen.getByText("Preferred $30–$50 CAD per person")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Free" }));
    expect(screen.getByText("Preferred $0–$0 CAD per person")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "$15–30" }));
    expect(screen.getByRole("button", { name: "$15–30" })).toHaveAttribute("aria-pressed", "true");
    const from = screen.getByLabelText("From");
    fireEvent.change(from, { target: { value: "42" } });
    fireEvent.blur(from);
    // Snaps to $5 and lifts the maximum so min <= max.
    expect(screen.getByText("Preferred $40–$40 CAD per person")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Preferred maximum"), { target: { value: "20" } });
    expect(screen.getByText("Preferred $20–$20 CAD per person")).toBeInTheDocument();
    expect(screen.getByText("Choose one — there's no default.")).toBeInTheDocument();
    next();
    expect(screen.getByRole("alert")).toHaveTextContent(/No hard limit/);
    fireEvent.click(screen.getByLabelText("No hard limit"));
    next();
    expect(screen.getByRole("heading", { name: "When are you free?" })).toBeInTheDocument();
  });

  it("rejects a ceiling below the preferred maximum", () => {
    render(
      <MemberHarness
        save={vi.fn()}
        initialStep={step("budget")}
        initial={{ ...filled, ceiling: null }}
      />,
    );
    fireEvent.click(screen.getByLabelText("Set a hard ceiling"));
    const cap = screen.getByLabelText("Never more than (CAD)");
    fireEvent.change(cap, { target: { value: "10" } });
    fireEvent.blur(cap);
    next();
    expect(screen.getByRole("alert")).toHaveTextContent(/at least your preferred maximum/);
  });
});

describe("Tonight availability", () => {
  const tonight = {
    ...calendarContext,
    availabilityMode: "tonight" as const,
    candidateDates: [TODAY],
  };
  it("offers independent Anytime and No deadline choices with next-day labels", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(
      <MemberHarness
        save={save}
        context={tonight}
        initialStep={step("availability")}
        initial={{ ...filled, days: {} }}
      />,
    );
    next();
    expect(screen.getByRole("alert")).toHaveTextContent(/Anytime/);
    fireEvent.click(screen.getByLabelText(/Anytime from now/));
    fireEvent.click(screen.getByLabelText(/By a specific time/));
    const home = screen.getByLabelText("Home by · Montréal") as HTMLSelectElement;
    expect([...home.options].some((option) => option.text === "1:00 AM (next day)")).toBe(true);
    fireEvent.change(home, { target: { value: "2026-11-23T06:00:00.000Z" } });
    fireEvent.click(screen.getByLabelText(/From a specific time/));
    fireEvent.change(screen.getByLabelText("I can leave at · Montréal"), {
      target: { value: "2026-11-23T02:00:00.000Z" },
    });
    for (let index = 0; index < 3; index++) next();
    fireEvent.click(screen.getByRole("button", { name: "Save & join the plan" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0].availability).toEqual({
      mode: "tonight",
      tonight: {
        earliestDepartureAt: "2026-11-23T02:00:00.000Z",
        latestReturnAt: "2026-11-23T06:00:00.000Z",
        anytimeFromNow: false,
        noReturnDeadline: false,
      },
      days: [],
    });
  });

  it("switches to No deadline independently of the departure choice", () => {
    render(<MemberHarness save={vi.fn()} context={tonight} initialStep={step("availability")} />);
    fireEvent.click(screen.getByLabelText(/No deadline/));
    next();
    expect(screen.getByRole("alert")).toHaveTextContent(/free from/);
    fireEvent.click(screen.getByLabelText(/Anytime from now/));
    next();
    expect(
      screen.getByRole("heading", { name: "Where are you starting from?" }),
    ).toBeInTheDocument();
  });
});

describe("Busy-time calendar", () => {
  const renderGrid = () =>
    render(
      <MemberHarness
        save={vi.fn()}
        initialStep={step("availability")}
        initial={{ ...filled, days: {} }}
      />,
    );
  // Same-day cells only; next-day spillover cells say "(next day)".
  const cell = (label: string) =>
    screen.getByRole("button", { name: new RegExp(`^${label} to [0-9]+:[0-9]+ [AP]M,`) });

  it("drags to paint red busy time, erases, undoes and clears", () => {
    renderGrid();
    const grid = screen.getByRole("group", { name: /Busy times on Tuesday, November 24/ });
    const start = cell("9:00 AM");
    const end = cell("10:30 AM");
    const target = vi.fn<(x: number, y: number) => Element | null>().mockReturnValue(end);
    Object.defineProperty(document, "elementFromPoint", { value: target, configurable: true });
    fireEvent.pointerDown(start, { pointerId: 7, pointerType: "touch", clientX: 1, clientY: 1 });
    fireEvent.pointerMove(grid, { pointerId: 7, pointerType: "touch", clientX: 50, clientY: 1 });
    expect(screen.getByText(/Painting busy: 9:00 AM – 11:00 AM/)).toBeInTheDocument();
    fireEvent.pointerUp(grid, { pointerId: 7, pointerType: "touch" });
    fireEvent.click(start); // the synthetic click after a drag must not toggle again
    for (const label of ["9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM"])
      expect(cell(label)).toHaveAttribute("aria-pressed", "true");
    expect(cell("9:00 AM")).toHaveAccessibleName(/busy$/);

    fireEvent.click(screen.getByRole("button", { name: "Erase" }));
    target.mockReturnValue(cell("10:00 AM"));
    fireEvent.pointerDown(cell("9:30 AM"), { pointerId: 8, pointerType: "mouse", button: 0 });
    fireEvent.pointerMove(grid, { pointerId: 8, pointerType: "mouse", clientX: 2, clientY: 2 });
    fireEvent.pointerUp(grid, { pointerId: 8, pointerType: "mouse" });
    expect(cell("9:30 AM")).toHaveAttribute("aria-pressed", "false");
    expect(cell("9:00 AM")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(cell("9:30 AM")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(cell("9:00 AM")).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles with tap and keyboard and moves focus with arrow keys", () => {
    renderGrid();
    const first = cell("12:00 AM");
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell("12:30 AM"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell("3:30 AM"));
  });

  it("labels overnight spillover as the next day", () => {
    renderGrid();
    expect(screen.getByText(/After midnight · Wed, Nov 25/)).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^1:00 AM to 1:30 AM \(next day\)/ }),
    ).toHaveLength(1);
  });

  it("requires every day to be confirmed, never treating blank days as free", () => {
    renderGrid();
    next();
    expect(screen.getByRole("alert")).toHaveTextContent("2 left");
    fireEvent.click(cell("9:00 AM"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Tue, Nov 24" }));
    expect(screen.getByText("1 of 2 days confirmed")).toBeInTheDocument();
    // Confirming moves on to the next unreviewed day.
    expect(screen.getByRole("heading", { name: "Thursday, November 26" })).toBeInTheDocument();
    fireEvent.click(cell("6:00 PM"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Thu, Nov 26" }));
    fireEvent.click(screen.getByRole("button", { name: /Tuesday, November 24: Confirmed/ }));
    // Editing a confirmed day asks for confirmation again.
    fireEvent.click(cell("9:30 AM"));
    expect(screen.getByText("1 of 2 days confirmed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I'm free all day" }));
    expect(screen.getByText("2 of 2 days confirmed")).toBeInTheDocument();
    next();
    expect(
      screen.getByRole("heading", { name: "Where are you starting from?" }),
    ).toBeInTheDocument();
  });

  it("allows a fully busy day when a different confirmed day has enough free time", () => {
    renderGrid();
    fireEvent.click(screen.getByRole("button", { name: "Busy all day" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Tue, Nov 24" }));
    fireEvent.click(screen.getByRole("button", { name: "I'm free all day" }));
    next();
    expect(
      screen.getByRole("heading", { name: "Where are you starting from?" }),
    ).toBeInTheDocument();
  });

  it("disables slots that already passed today", () => {
    render(
      <MemberHarness
        save={vi.fn()}
        initialStep={step("availability")}
        context={{ ...calendarContext, candidateDates: [TODAY] }}
      />,
    );
    expect(cell("6:30 PM")).toHaveAccessibleName(/already passed/);
    expect(cell("7:30 PM")).toHaveAccessibleName(/free$/);
    expect(NOW).toBeGreaterThan(0);
  });
});

describe("Starting point", () => {
  const stubGeo = (impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    const getCurrentPosition = vi.fn(impl);
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });
    return getCurrentPosition;
  };

  it("asks for location only when tapped and rounds the result", async () => {
    const geo = stubGeo((ok) =>
      ok({ coords: { latitude: 45.50891, longitude: -73.56123 } } as GeolocationPosition),
    );
    render(<MemberHarness save={vi.fn()} initialStep={step("origin")} initial={filled} />);
    expect(geo).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    });
    expect(geo).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Near my current location")).toBeInTheDocument();
  });

  it("falls back to manual selection when permission is denied", async () => {
    stubGeo((_ok, fail) =>
      fail({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 } as GeolocationPositionError),
    );
    const save = vi.fn().mockResolvedValue(true);
    render(
      <MemberHarness
        save={save}
        initialStep={step("origin")}
        initial={{ ...filled, origin: null }}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    });
    expect(screen.getByText(/permission was denied/)).toBeInTheDocument();
    next();
    expect(screen.getByText("Choose a starting point.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "old" } });
    fireEvent.click(screen.getByLabelText(/Old Montreal/));
    expect(screen.queryByLabelText(/Verdun/)).toBeNull();
    expect(screen.getByText(/applies to all 2 days/)).toBeInTheDocument();
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Save & join the plan" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![0].origin).toEqual({
      source: "manual",
      label: "Old Montreal",
      lat: 45.5,
      lng: -73.55,
      accuracy: "approximate",
    });
  });

  it("offers the group area only as an explicit choice", () => {
    render(
      <MemberHarness
        save={vi.fn()}
        initialStep={step("origin")}
        initial={{ ...filled, origin: null }}
      />,
    );
    const group = screen.getByRole("button", { name: /Start from the group area: Le Plateau/ });
    expect(group).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(group);
    expect(group).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Travel", () => {
  it.each([
    ["Walk", "walk"],
    ["Transit", "transit"],
    ["Drive", "drive"],
    ["Bike", "bike"],
  ] as const)("saves %s with a one-way limit and optional return mode", async (label, mode) => {
    const save = vi.fn().mockResolvedValue(true);
    render(
      <MemberHarness
        save={save}
        initialStep={step("travel")}
        initial={{ ...filled, travelMode: null }}
      />,
    );
    next();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose how you'll travel.");
    fireEvent.click(screen.getByRole("radio", { name: label }));
    expect(
      screen.getByText(new RegExp(`one way by ${label.toLowerCase()}`, "i")),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "45 min" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "transit" } });
    next();
    fireEvent.click(screen.getByRole("button", { name: "Save & join the plan" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![0].travel).toEqual({
      mode,
      maxOneWayMinutes: 45,
      returnMode: "transit",
      alreadyAtSharedMeetingPoint: false,
    });
  });

  it("asks about the shared meeting point only for group travel", () => {
    render(
      <MemberHarness
        save={vi.fn()}
        initialStep={step("travel")}
        initial={filled}
        context={{ ...calendarContext, sharedTravel: true }}
      />,
    );
    expect(screen.getByLabelText(/already be at the meeting point/)).toBeInTheDocument();
    cleanup();
    render(<MemberHarness save={vi.fn()} initialStep={step("travel")} initial={filled} />);
    expect(screen.queryByLabelText(/already be at the meeting point/)).toBeNull();
  });
});

describe("Review and save", () => {
  it("shows private answers with edit links and keeps the draft after a failed save", async () => {
    const save = vi.fn().mockResolvedValue(false);
    render(<MemberHarness save={save} initialStep={step("review")} initial={filled} />);
    expect(screen.getByText("Preferred $0–$15 CAD")).toBeInTheDocument();
    expect(screen.getByText("Hard ceiling $25")).toBeInTheDocument();
    expect(screen.getByText("Tue, Nov 24: busy 6:00 p.m.–7:00 p.m.")).toBeInTheDocument();
    expect(screen.getByText("Thu, Nov 26: free all day")).toBeInTheDocument();
    expect(screen.getByText("Walk, up to 20 min each way")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save & join the plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/still here/);
    fireEvent.click(screen.getByRole("button", { name: "Edit Budget" }));
    expect(screen.getByRole("heading", { name: "What's your budget?" })).toBeInTheDocument();
  });

  it("never sends answers when saving isn't possible", () => {
    const save = vi.fn();
    render(
      <MemberHarness save={save} canSave={false} initialStep={step("review")} initial={filled} />,
    );
    expect(screen.getByRole("button", { name: /Can't save yet/ })).toBeDisabled();
    expect(screen.getByText("Not saved yet")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
