import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostConfigV3 } from "./contract";
import { HostHarness } from "./test-utils";

// These flows render large accessible grids; role queries are slow under a parallel run.
vi.setConfig({ testTimeout: 20_000 });
afterEach(cleanup);

const save = () => screen.getByRole("button", { name: "Save hangout settings" });
const day = (label: RegExp) => screen.getByRole("button", { name: label });
function chooseArea() {
  fireEvent.click(screen.getByLabelText(/I'll choose the area/));
  const area = screen.getAllByRole("radiogroup", { name: "Area results" })[0]!;
  fireEvent.click(within(area).getByLabelText(/Mile End/));
}

describe("Host setup (single screen)", () => {
  it("shows every section on one page and reports inline errors without saving", () => {
    const mock = vi.fn().mockResolvedValue(true);
    render(<HostHarness save={mock} />);
    for (const title of ["When?", "Where?", "Group rules", "Getting there", "How long?"])
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    fireEvent.click(save());
    expect(screen.getByText("Choose when this is happening.")).toBeInTheDocument();
    expect(screen.getByText("Choose a meeting area or let the app find one.")).toBeInTheDocument();
    expect(screen.getByText("2 sections need attention.")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });

  it("saves Today/Tonight with a real area exactly once and only reports success after confirmation", async () => {
    let resolve: (value: boolean) => void = () => {};
    const mock = vi.fn((_config: HostConfigV3) => new Promise<boolean>((r) => (resolve = r)));
    render(<HostHarness save={mock} />);
    fireEvent.click(screen.getByLabelText(/Today \/ Tonight/));
    chooseArea();
    expect(screen.getByText("Selected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Preview map/ })).toHaveAttribute(
      "href",
      expect.stringContaining("45.52%2C-73.6"),
    );
    fireEvent.click(screen.getByLabelText(/Hard boundary/));
    fireEvent.click(save());
    fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]![0]).toMatchObject({
      version: 3,
      dateSelection: { mode: "today_tonight", candidateDates: ["2026-11-22"], range: null },
      area: {
        mode: "host_area",
        label: "Mile End",
        point: { lat: 45.52, lng: -73.6 },
        isStrict: true,
      },
      duration: { mode: "fixed", minMinutes: 120, maxMinutes: 120 },
    });
    resolve(false);
    expect(await screen.findByText(/save wasn't confirmed/)).toBeInTheDocument();
    // The draft is kept after a failed save.
    expect(screen.getByLabelText(/Today \/ Tonight/)).toBeChecked();
  });

  it("supports one, several and range future dates within the 14-day limit", async () => {
    const mock = vi.fn().mockResolvedValue(true);
    render(<HostHarness save={mock} />);
    fireEvent.click(screen.getByLabelText(/Pick future date/));
    chooseArea();
    fireEvent.click(day(/Tuesday, November 24/));
    expect(screen.getByText("1 day selected: Tue, Nov 24")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Several dates"));
    fireEvent.click(day(/Thursday, November 26/));
    fireEvent.click(day(/Saturday, November 28/));
    expect(screen.getByText(/3 days selected/)).toBeInTheDocument();
    fireEvent.click(day(/Thursday, November 26/));
    expect(screen.getByText(/2 days selected/)).toBeInTheDocument();
    // Horizon is today through today + 14 days; later dates are not offered at all.
    expect(day(/Sunday, December 6/)).toBeEnabled();
    expect(screen.queryByRole("button", { name: /December 7/ })).toBeNull();
    fireEvent.click(screen.getByLabelText("Date range"));
    // A range starting today may cover at most 14 days, so today + 14 is disabled.
    fireEvent.click(day(/Sunday, November 22/));
    expect(day(/Saturday, December 5/)).toBeEnabled();
    expect(day(/Sunday, December 6/)).toBeDisabled();
    fireEvent.click(day(/Saturday, December 5/));
    expect(screen.getByText(/14 days selected/)).toBeInTheDocument();
    fireEvent.click(day(/Monday, November 23/));
    expect(screen.getByText(/now tap the last day/)).toBeInTheDocument();
    fireEvent.click(day(/Wednesday, November 25/));
    expect(screen.getByText(/3 days selected: Mon, Nov 23 – Wed, Nov 25/)).toBeInTheDocument();
    fireEvent.click(save());
    await waitFor(() => expect(mock).toHaveBeenCalled());
    expect(mock.mock.calls[0]![0].dateSelection).toEqual({
      mode: "future_dates",
      selectionStyle: "range",
      candidateDates: ["2026-11-23", "2026-11-24", "2026-11-25"],
      range: { startDate: "2026-11-23", endDate: "2026-11-25" },
    });
  });

  it("requires a host range for best day and optimize-for-group needs no area", async () => {
    const mock = vi.fn().mockResolvedValue(true);
    render(<HostHarness save={mock} />);
    fireEvent.click(screen.getByLabelText(/Find best day together/));
    fireEvent.click(screen.getByLabelText(/Let the app find a convenient area/));
    fireEvent.click(save());
    expect(screen.getByText(/first and last day the app can pick from/)).toBeInTheDocument();
    fireEvent.click(day(/Tuesday, November 24/));
    fireEvent.click(day(/Friday, November 27/));
    fireEvent.click(save());
    await waitFor(() => expect(mock).toHaveBeenCalled());
    expect(mock.mock.calls[0]![0]).toMatchObject({
      dateSelection: {
        mode: "best_day",
        selectionStyle: null,
        range: { startDate: "2026-11-24", endDate: "2026-11-27" },
      },
      area: { mode: "optimize_for_group", label: null, point: null, isStrict: false },
    });
  });

  it("captures rules, shared travel and flexible duration", async () => {
    const mock = vi.fn().mockResolvedValue(true);
    render(<HostHarness save={mock} />);
    fireEvent.click(screen.getByLabelText(/Today \/ Tonight/));
    chooseArea();
    fireEvent.click(screen.getByLabelText(/Under-18 friendly/));
    fireEvent.click(screen.getByLabelText(/Alcohol-free venues only/));
    fireEvent.click(screen.getByLabelText(/Free activities only/));
    fireEvent.click(screen.getByRole("button", { name: "Wheelchair-accessible entrance" }));
    fireEvent.click(screen.getByRole("button", { name: "Halal" }));
    fireEvent.click(screen.getByLabelText(/We travel together/));
    fireEvent.click(save());
    expect(screen.getByText("Choose where everyone meets before travelling.")).toBeInTheDocument();
    const meeting = screen.getAllByRole("radiogroup", { name: "Meeting point results" })[0]!;
    fireEvent.click(within(meeting).getByLabelText(/Downtown/));
    fireEvent.click(screen.getByRole("radio", { name: "Transit" }));
    fireEvent.click(screen.getByLabelText(/Flexible/));
    fireEvent.change(screen.getByLabelText("Shortest"), { target: { value: "90" } });
    fireEvent.change(screen.getByLabelText("Longest"), { target: { value: "210" } });
    fireEvent.click(save());
    await waitFor(() => expect(mock).toHaveBeenCalled());
    expect(mock.mock.calls[0]![0]).toMatchObject({
      duration: { mode: "flexible", minMinutes: 90, maxMinutes: 210 },
      travelArrangement: {
        mode: "together",
        sharedMeetingPoint: { label: "Downtown", lat: 45.5, lng: -73.57 },
        sharedMode: "transit",
      },
      rules: {
        under18Friendly: true,
        freeOnly: true,
        alcoholPolicy: "alcohol_free_only",
        requiredAccessibility: ["wheelchair_accessible_entrance"],
        dietaryHardRequirements: ["halal"],
      },
    });
  });

  it("never sends settings when saving isn't allowed", () => {
    const mock = vi.fn();
    render(<HostHarness save={mock} canSave={false} />);
    expect(screen.getByText("Can't save settings here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Can't save settings" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Today \/ Tonight/));
    fireEvent.click(screen.getByRole("button", { name: "Check my settings" }));
    expect(screen.getByText(/1 section needs attention/)).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });
});
