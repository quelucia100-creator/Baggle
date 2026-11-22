import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanningExperience } from "./PlanningExperience";
import { ConfigForm, PreferencesForm } from "./PlanningForms";
import { planningControls, validateConfig, validatePreferences, formatPlanTime, planningError } from "./model";
import type { PlanningState } from "@/lib/planning/types";
import type { PartyState } from "@/lib/party";
vi.mock("./PlanMap", () => ({ PlanMap: () => null }));

const hostId = "00000000-0000-4000-8000-000000000001";
const guestId = "00000000-0000-4000-8000-000000000002";
const config = {
  category: "park" as const,
  date: "2026-11-22",
  durationMin: 60,
  areaLabel: "Plateau",
  area: { lat: 45.52, lng: -73.57 },
};
const preferences = {
  budget: 0,
  freeFrom: "23:00",
  freeTo: "02:00",
  maxTravelMin: 30,
  originLat: null,
  originLng: null,
};
const party: PartyState = {
  code: "ABC123",
  selfId: hostId,
  isHost: true,
  started: false,
  view: "team",
  hangout: null,
  members: [
    { id: hostId, name: "Alex", host: true, location: null },
    { id: guestId, name: "Misha", host: false, location: null },
  ],
};
const base: PlanningState = {
  status: "collecting",
  revision: 4,
  config,
  selfPreferences: null,
  members: [
    { id: hostId, submitted: true },
    { id: guestId, submitted: true },
  ],
  plan: null,
  planIndex: 0,
  optionCount: 3,
  groupRerollsUsed: 0,
  votes: 0,
  voteThreshold: 2,
  selfVoted: false,
  noPlanReason: null,
  venueSource: "fallback",
};
const locked: PlanningState = {
  ...base,
  status: "locked",
  plan: {
    venue: {
      placeId: "park",
      name: "Parc La Fontaine",
      category: "park",
      priceTier: 0,
      location: config.area,
      mapsUrl: "https://maps.google.com/?q=Parc+La+Fontaine",
      outdoor: true,
    },
    startAt: "2026-11-23T04:00:00Z",
    endAt: "2026-11-23T06:00:00Z",
    compromise: "Review this option",
    hoursUnknown: false,
    weather: { temperature: 6, precipitation: 0, code: 0 },
  },
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const show = (state = base, isHost = true, busy = false) => {
  const submit = vi.fn(async () => true);
  render(
    <PlanningExperience
      party={{ ...party, isHost, selfId: isHost ? hostId : guestId }}
      state={state}
      busy={busy}
      submit={submit}
    />,
  );
  return submit;
};

describe("Planning role and readiness rules", () => {
  it("does not confuse a Google Maps permission error with guest membership or expose raw provider details", () => {
    const message = planningError(new Error("Google Maps denied event travel checks (403). Check the connection's permissions before trying again."));
    expect(message).toBe("Google Maps couldn't check travel. Check its connection or try again; your private answers are saved.");
    expect(message).not.toContain("party membership");
    expect(message).not.toContain("403");
  });
  it("allows host locking with two submissions", () => {
    const submit = show();
    fireEvent.click(screen.getByRole("button", { name: "Lock & find a plan" }));
    expect(submit).toHaveBeenCalledWith({ action: "lock" });
  });
  it("prevents locking with only one submission", () => {
    show({
      ...base,
      members: [
        { id: hostId, submitted: true },
        { id: guestId, submitted: false },
      ],
    });
    expect(screen.getByRole("button", { name: "Lock & find a plan" })).toBeDisabled();
  });
  it("does not give guests configure or lock actions", () => {
    expect(planningControls(base, false, guestId).canLock).toBe(false);
    show(base, false);
    expect(screen.queryByRole("form", { name: "Event details" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lock & find a plan" })).toBeNull();
  });
  it("counts readiness only from submitted booleans", () => {
    expect(
      planningControls(
        {
          ...base,
          members: [
            { id: hostId, submitted: false },
            { id: guestId, submitted: true },
          ],
        },
        true,
        hostId,
      ).ready,
    ).toBe(1);
  });
  it("initializes the form only with caller preferences", () => {
    show({ ...base, selfPreferences: { ...preferences, budget: 3 } });
    fireEvent.click(screen.getByRole("button", { name: "Edit my private preferences" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Budget $$$" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("Client validation mirrors planning limits", () => {
  it("accepts budget 0 and 4", () => {
    expect(validatePreferences(preferences).budget).toBe(0);
    expect(validatePreferences({ ...preferences, budget: 4 }).budget).toBe(4);
  });
  it("rejects budgets outside 0–4", () => {
    expect(() => validatePreferences({ ...preferences, budget: -1 })).toThrow();
    expect(() => validatePreferences({ ...preferences, budget: 5 })).toThrow();
  });
  it("accepts overnight availability unchanged", () => {
    expect(validatePreferences(preferences)).toMatchObject({ freeFrom: "23:00", freeTo: "02:00" });
  });
  it("limits travel to 5–90 minutes", () => {
    expect(validatePreferences({ ...preferences, maxTravelMin: 5 }).maxTravelMin).toBe(5);
    expect(validatePreferences({ ...preferences, maxTravelMin: 90 }).maxTravelMin).toBe(90);
    expect(() => validatePreferences({ ...preferences, maxTravelMin: 4 })).toThrow();
    expect(() => validatePreferences({ ...preferences, maxTravelMin: 91 })).toThrow();
  });
  it("rejects invalid local clock times", () => {
    expect(() => validatePreferences({ ...preferences, freeFrom: "25:00" })).toThrow();
  });
  it("requires origins as a pair", () => {
    expect(() => validatePreferences({ ...preferences, originLat: 45.5 })).toThrow();
  });
  it("restricts duration to 30–240 minutes", () => {
    expect(validateConfig({ ...config, durationMin: 30 }, config.date).durationMin).toBe(30);
    expect(validateConfig({ ...config, durationMin: 240 }, config.date).durationMin).toBe(240);
    expect(() => validateConfig({ ...config, durationMin: 29 }, config.date)).toThrow();
    expect(() => validateConfig({ ...config, durationMin: 241 }, config.date)).toThrow();
  });
  it("permits today through 14 days ahead inclusively", () => {
    expect(validateConfig(config, config.date).date).toBe("2026-11-22");
    expect(validateConfig({ ...config, date: "2026-12-06" }, config.date).date).toBe("2026-12-06");
    expect(() => validateConfig({ ...config, date: "2026-11-21" }, config.date)).toThrow();
    expect(() => validateConfig({ ...config, date: "2026-12-07" }, config.date)).toThrow();
  });
  it("rejects invalid areas and unsupported categories", () => {
    expect(() => validateConfig({ ...config, area: { lat: 91, lng: 0 } }, config.date)).toThrow();
    expect(() => validateConfig({ ...config, category: "shopping" }, config.date)).toThrow();
  });
  it("keeps a saved budget unexposed until its dedicated step", () => {
    const submit = vi.fn(async () => true);
    render(<PreferencesForm preferences={preferences} busy={false} submit={submit} />);
    expect(screen.getByLabelText("Free from · Montreal")).toHaveValue("23:00");
    expect(screen.queryByRole("button", { name: "Budget Free" })).toBeNull();
  });
  it("rejects a bad config without sending a mutation", () => {
    const submit = vi.fn(async () => true);
    render(<ConfigForm config={{ ...config, durationMin: 29 }} busy={false} submit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("Shared plan transitions", () => {
  it("keeps caller preferences and origin out of the shared readiness roster", () => {
    show(
      {
        ...base,
        selfPreferences: { ...preferences, budget: 4, originLat: 45.55, originLng: -73.6 },
      },
      false,
    );
    const roster = screen.getByRole("complementary", { name: "Crew readiness" });
    expect(roster).toHaveTextContent("Alex");
    expect(roster).toHaveTextContent("Misha");
    expect(roster).not.toHaveTextContent("23:00");
    expect(roster).not.toHaveTextContent("45.55");
    expect(roster).not.toHaveTextContent("$$$$");
  });
  it("disables duplicate actions while a mutation is pending", () => {
    show(base, true, true);
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
  });
  it("allows host recovery only after 30 seconds of locking", () => {
    vi.useFakeTimers();
    const submit = show({ ...base, status: "locking" });
    expect(screen.queryByRole("button", { name: "Retry finding a plan" })).toBeNull();
    act(() => vi.advanceTimersByTime(29_999));
    expect(screen.queryByRole("button", { name: "Retry finding a plan" })).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    fireEvent.click(screen.getByRole("button", { name: "Retry finding a plan" }));
    expect(submit).toHaveBeenCalledWith({ action: "lock" });
  });
  it("never gives guests interrupted-lock recovery", () => {
    show({ ...base, status: "locking" }, false);
    expect(planningControls(base, false, guestId).canLock).toBe(false);
    expect(screen.queryByRole("button", { name: "Retry finding a plan" })).toBeNull();
  });
  it("formats cross-midnight results in Montreal, not the browser zone", () => {
    expect(formatPlanTime("2026-11-23T04:00:00Z")).toContain("Nov 22");
    expect(formatPlanTime("2026-11-23T06:00:00Z")).toContain("Nov 23");
  });
  it("sends the current revision when voting", () => {
    const submit = show(locked, false);
    fireEvent.click(screen.getByRole("button", { name: "Vote to reroll" }));
    expect(submit).toHaveBeenCalledWith({ action: "vote", revision: 4 });
  });
  it("blocks duplicate votes", () => {
    show({ ...locked, selfVoted: true }, false);
    expect(screen.getByRole("button", { name: "Vote recorded" })).toBeDisabled();
  });
  it("allows only lock participants to vote", () => {
    expect(
      planningControls(
        {
          ...locked,
          members: [
            { id: hostId, submitted: true },
            { id: guestId, submitted: false },
          ],
        },
        false,
        guestId,
      ).canVote,
    ).toBe(false);
  });
  it("caps shared rerolls at three but preserves host rerolls", () => {
    const controls = planningControls({ ...locked, groupRerollsUsed: 3 }, true, hostId);
    expect(controls.canVote).toBe(false);
    expect(controls.canReroll).toBe(true);
  });
  it("sends host reroll and finalize commands", () => {
    const submit = show(locked);
    fireEvent.click(screen.getByRole("button", { name: /^Reroll$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));
    expect(submit.mock.calls).toEqual([
      [{ action: "host_reroll", revision: 4 }],
      [{ action: "finalize" }],
    ]);
  });
  it("keeps host actions off guest result screens", () => {
    show(locked, false);
    expect(planningControls(locked, false, guestId).canFinalize).toBe(false);
    expect(screen.queryByRole("button", { name: "Finalize" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Reroll$/ })).toBeNull();
  });
  it("disables every reroll at the last option", () => {
    const controls = planningControls({ ...locked, planIndex: 2 }, true, hostId);
    expect(controls.remaining).toBe(0);
    expect(controls.canVote).toBe(false);
    expect(controls.canReroll).toBe(false);
  });
  it("prevents edits and voting after finalization", () => {
    show({ ...locked, status: "final" });
    expect(planningControls({ ...locked, status: "final" }, true, hostId).canFinalize).toBe(false);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("lets the host reopen a neutral no-plan result", () => {
    const submit = show({ ...base, status: "no_plan", noPlanReason: "no_match" });
    fireEvent.click(screen.getByRole("button", { name: "Reopen planning" }));
    expect(submit).toHaveBeenCalledWith({ action: "reopen" });
  });
  it("does not allow guests to reopen no-plan", () => {
    expect(
      planningControls({ ...base, status: "no_plan", noPlanReason: "no_match" }, false, guestId)
        .canReopen,
    ).toBe(false);
    show({ ...base, status: "no_plan", noPlanReason: "no_match" }, false);
    expect(screen.queryByRole("button", { name: "Reopen planning" })).toBeNull();
  });
});
