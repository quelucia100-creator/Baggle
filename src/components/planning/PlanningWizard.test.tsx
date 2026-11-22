import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigForm, PreferencesForm } from "./PlanningForms";
import {
  areaConfig,
  areas,
  privateDraft,
  privatePayload,
  validatePrivateStep,
} from "./wizard-model";
import { CollectingInputs } from "./CollectingInputs";
import type { PlanningState } from "@/lib/planning/types";
import type { PartyState } from "@/lib/party";

const config = {
  date: "2026-11-22",
  durationMin: 60,
  areaLabel: "Existing label",
  area: { lat: 45.5231, lng: -73.5713 },
  category: "park" as const,
};
const saved = {
  budget: 4,
  freeFrom: "23:00",
  freeTo: "02:00",
  maxTravelMin: 45,
  originLat: 45.52,
  originLng: -73.6,
};
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
function availability() {
  fireEvent.change(screen.getByLabelText("Free from · Montreal"), { target: { value: "23:00" } });
  fireEvent.change(screen.getByLabelText("Free until · Montreal"), { target: { value: "02:00" } });
}
function completePrivate() {
  availability();
  next();
  fireEvent.click(screen.getByRole("button", { name: "Budget $$" }));
  next();
  next();
  next();
}
afterEach(cleanup);

describe("Private question wizard", () => {
  it("requires both availability times before advancing", () => {
    const submit = vi.fn(async () => true);
    render(<PreferencesForm preferences={null} busy={false} submit={submit} />);
    next();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Free from · Montreal"), { target: { value: "23:00" } });
    next();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    fireEvent.change(screen.getByLabelText("Free until · Montreal"), {
      target: { value: "02:00" },
    });
    next();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  });
  it("does not preselect Free or any budget and requires an explicit selection", () => {
    render(<PreferencesForm preferences={null} busy={false} submit={vi.fn(async () => true)} />);
    availability();
    next();
    expect(
      screen
        .getAllByRole("button", { name: /^Budget / })
        .every((button) => button.getAttribute("aria-pressed") === "false"),
    ).toBe(true);
    next();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    fireEvent.click(screen.getByRole("button", { name: "Budget Free" }));
    next();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
  });
  it("preserves answers using Back and review Edit without saving early", () => {
    const submit = vi.fn(async () => true);
    render(<PreferencesForm preferences={null} busy={false} submit={submit} />);
    completePrivate();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit Budget" }));
    expect(screen.getByRole("button", { name: "Budget $$" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Free from · Montreal")).toHaveValue("23:00");
    expect(screen.getByLabelText("Free until · Montreal")).toHaveValue("02:00");
  });
  it("validates the custom travel limit and preserves preset numerical semantics", () => {
    render(<PreferencesForm preferences={saved} busy={false} submit={vi.fn(async () => true)} />);
    next();
    next();
    fireEvent.change(screen.getByLabelText("Or choose your own · 5–90 minutes"), {
      target: { value: "4" },
    });
    next();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
    fireEvent.click(screen.getByRole("button", { name: "90 minutes" }));
    expect(screen.getByLabelText("Or choose your own · 5–90 minutes")).toHaveValue(90);
    next();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
  });
  it("saves null origins by default only at review with an overnight window", async () => {
    const submit = vi.fn(async () => true);
    const onSaved = vi.fn();
    render(<PreferencesForm preferences={null} busy={false} submit={submit} onSaved={onSaved} />);
    completePrivate();
    fireEvent.click(screen.getByRole("button", { name: "Save & join the plan" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(submit).toHaveBeenCalledWith({
      action: "save",
      preferences: {
        budget: 2,
        freeFrom: "23:00",
        freeTo: "02:00",
        maxTravelMin: 30,
        originLat: null,
        originLng: null,
      },
    });
  });
  it("uses real rough neighbourhood coordinates without GPS or coordinate inputs", async () => {
    const gps = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: gps },
    });
    const submit = vi.fn(async () => true);
    render(<PreferencesForm preferences={saved} busy={false} submit={submit} />);
    next();
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: /Rosemont/ }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Update my preferences" }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit).toHaveBeenCalledWith({
      action: "save",
      preferences: { ...saved, originLat: 45.55, originLng: -73.58 },
    });
    expect(gps).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/latitude|longitude/i)).toBeNull();
  });
  it("rehydrates every saved answer on revisit, including budget zero", () => {
    const first = render(
      <PreferencesForm
        preferences={{ ...saved, budget: 0 }}
        busy={false}
        submit={vi.fn(async () => true)}
      />,
    );
    first.unmount();
    render(
      <PreferencesForm
        preferences={{ ...saved, budget: 0 }}
        busy={false}
        submit={vi.fn(async () => true)}
      />,
    );
    next();
    expect(screen.getByRole("button", { name: "Budget Free" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    next();
    expect(screen.getByLabelText("Or choose your own · 5–90 minutes")).toHaveValue(45);
    next();
    expect(screen.getByRole("button", { name: /Mile End/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("never reports success before the backend resolves and blocks duplicate saves", async () => {
    let finish: ((result: boolean) => void) | undefined;
    const submit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const onSaved = vi.fn();
    render(<PreferencesForm preferences={null} busy={false} submit={submit} onSaved={onSaved} />);
    completePrivate();
    fireEvent.click(screen.getByRole("button", { name: "Save & join the plan" }));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(submit).toHaveBeenCalledOnce();
    if (!finish) throw new Error("Save did not start");
    finish(true);
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  });
  it("keeps review and answers available after a rejected save", async () => {
    const onSaved = vi.fn();
    render(
      <PreferencesForm
        preferences={saved}
        busy={false}
        submit={vi.fn(async () => false)}
        onSaved={onSaved}
      />,
    );
    next();
    next();
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Update my preferences" }));
    await screen.findByRole("alert");
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit Budget" }));
    expect(screen.getByRole("button", { name: "Budget $$$$" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("keeps unsaved edits when new polling data arrives", () => {
    const submit = vi.fn(async () => true);
    const view = render(<PreferencesForm preferences={null} busy={false} submit={submit} />);
    availability();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Budget $$" }));
    view.rerender(<PreferencesForm preferences={saved} busy={false} submit={submit} />);
    expect(screen.getByRole("button", { name: "Budget $$" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("moves accessible heading focus to the active question", () => {
    render(<PreferencesForm preferences={saved} busy={false} submit={vi.fn(async () => true)} />);
    const first = screen.getByRole("heading", { level: 2 });
    expect(first).toHaveFocus();
    next();
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  });
});

describe("Host progressive setup", () => {
  it("maps an area label and both coordinates together and preserves unrelated config", () => {
    expect(areaConfig(config, "verdun")).toEqual({
      ...config,
      areaLabel: "Verdun",
      area: { lat: 45.46, lng: -73.57 },
    });
    expect(areaConfig(config, "unknown")).toBe(config);
  });
  it("keeps existing custom area coordinates unchanged unless a preset is selected", async () => {
    const submit = vi.fn(async () => true);
    render(<ConfigForm config={config} busy={false} submit={submit} />);
    next();
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Save event details" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ action: "configure", config }));
  });
  it("saves a chosen area and real category only at review", async () => {
    const submit = vi.fn(async () => true);
    render(<ConfigForm config={config} busy={false} submit={submit} />);
    next();
    fireEvent.click(screen.getByRole("button", { name: /Verdun/ }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Café" }));
    next();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save event details" }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        action: "configure",
        config: {
          ...config,
          category: "cafe",
          areaLabel: "Verdun",
          area: { lat: 45.46, lng: -73.57 },
        },
      }),
    );
  });
  it("preserves event edits on Back", () => {
    render(<ConfigForm config={config} busy={false} submit={vi.fn(async () => true)} />);
    fireEvent.change(screen.getByLabelText("Duration · 30–240 minutes"), {
      target: { value: "90" },
    });
    next();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Duration · 30–240 minutes")).toHaveValue(90);
  });
  it("separates host setup from the host's own private wizard and retains drafts on switching", () => {
    const party: PartyState = {
      code: "ABC123",
      selfId: "host",
      isHost: true,
      started: false,
      view: "team",
      hangout: null,
      members: [],
    };
    const state: PlanningState = {
      status: "collecting",
      revision: 0,
      config,
      selfPreferences: null,
      members: [],
      plan: null,
      planIndex: 0,
      optionCount: 0,
      groupRerollsUsed: 0,
      votes: 0,
      voteThreshold: 2,
      selfVoted: false,
      noPlanReason: null,
      venueSource: null,
    };
    render(
      <CollectingInputs
        party={party}
        state={state}
        busy={false}
        submit={vi.fn(async () => true)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Set up event" }));
    expect(screen.queryByLabelText("Free from · Montreal")).toBeNull();
    fireEvent.change(screen.getByLabelText("Duration · 30–240 minutes"), {
      target: { value: "90" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Add my private preferences" }));
    expect(screen.queryByLabelText("Date · Montreal")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Set up event" }));
    expect(screen.getByLabelText("Duration · 30–240 minutes")).toHaveValue(90);
  });
});

describe("Wizard contract validation", () => {
  it.each([15, 30, 45, 60, 90])("keeps %i-minute presets numerically unchanged", (minutes) => {
    expect(
      privatePayload({ ...privateDraft(saved), maxTravelMin: String(minutes) }).maxTravelMin,
    ).toBe(minutes);
  });
  it.each(["", "4", "91", "20.5", "invalid"])("rejects invalid travel %s", (value) => {
    expect(() => validatePrivateStep({ ...privateDraft(saved), maxTravelMin: value }, 2)).toThrow();
  });
  it("rounds preserved rough coordinates to two decimal places", () => {
    expect(
      privatePayload({ ...privateDraft(saved), originLat: 45.523456, originLng: -73.578912 }),
    ).toMatchObject({ originLat: 45.52, originLng: -73.58 });
  });
  it("maps every area to bounded Montreal coordinates", () => {
    for (const area of areas) {
      const result = areaConfig(config, area.id);
      expect(result.areaLabel).toBe(area.label);
      expect(result.area).toEqual({ lat: area.lat, lng: area.lng });
      expect(result.area.lat).toBeGreaterThan(45);
      expect(result.area.lng).toBeLessThan(-73);
    }
  });
});
