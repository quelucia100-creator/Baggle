import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicPlanOption } from "@/lib/planning/types";
import { PlanningV3Experience } from "./PlanningV3Experience";
import { NOW, guestId, hostId, party, thirdId, v2State, v3Plan, v3State } from "./test-utils";

// MOCKED submit: these tests never reach a server.
vi.setConfig({ testTimeout: 20_000 });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const legacyPlan: PublicPlanOption = {
  venue: {
    placeId: "fallback:parc-la-fontaine",
    name: "Parc La Fontaine",
    category: "park",
    priceTier: 2,
    location: { lat: 45.527, lng: -73.569 },
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Parc+La+Fontaine",
    outdoor: true,
  },
  startAt: "2026-11-24T23:00:00.000Z",
  endAt: "2026-11-25T01:00:00.000Z",
  compromise: "Review this option",
  hoursUnknown: true,
  weather: null,
};
const allReady = [
  { id: hostId, submitted: true },
  { id: guestId, submitted: true },
  { id: thirdId, submitted: false },
];
const guest = { ...party, selfId: guestId, isHost: false };
function view(state: Parameters<typeof PlanningV3Experience>[0]["state"], who = party) {
  const submit = vi.fn().mockResolvedValue(true);
  render(<PlanningV3Experience party={who} state={state} busy={false} submit={submit} now={NOW} />);
  return submit;
}

describe("Lobby and roster", () => {
  it("shows names and readiness only, with a privacy notice and progress", () => {
    view(v3State());
    expect(screen.getByText(/private — even from the host/)).toBeInTheDocument();
    const roster = screen.getByRole("complementary", { name: "Crew readiness" });
    expect(within(roster).getByText("1/3 completed")).toBeInTheDocument();
    expect(within(roster).getByText("Misha")).toBeInTheDocument();
    expect(within(roster).getAllByText(/Ready|Still answering/)).toHaveLength(3);
    expect(roster.textContent).not.toMatch(/\$|budget|busy|allerg/i);
  });

  it("requires the host's own answers plus one more before Find our plan", async () => {
    view(v3State());
    expect(screen.getByRole("button", { name: "Find our plan" })).toBeDisabled();
    expect(screen.getByText(/Add your own answers first/)).toBeInTheDocument();
    cleanup();
    const ready = view(v3State({ members: allReady }));
    expect(screen.getByText(/only the 2 ready people are included/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find our plan" }));
    expect(screen.getByRole("button", { name: "Starting…" })).toBeDisabled();
    await waitFor(() => expect(ready).toHaveBeenCalledWith({ action: "lock" }));
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it("opens the private wizard for a guest who hasn't answered", () => {
    const submit = view(
      v3State({
        members: [
          { id: hostId, submitted: true },
          { id: guestId, submitted: false },
        ],
      }),
      guest,
    );
    expect(screen.getByRole("heading", { name: "What's the vibe?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Everyone travels individually")).toBeInTheDocument();
    expect(screen.getByText("Tue, Nov 24, Thu, Nov 26")).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it("hydrates the member's own retained answers as an editable draft", () => {
    view(
      v3State({
        members: [
          { id: hostId, submitted: true },
          { id: guestId, submitted: false },
        ],
        selfPreferences: {
          version: 3,
          vibes: ["creative"],
          likedActivities: [],
          excludedActivities: [],
          budget: {
            currency: "CAD",
            preferredMinCad: 0,
            preferredMaxCad: 20,
            hardMaxCad: null,
            explicitlyUnlimited: true,
          },
          availability: { mode: "calendar", tonight: null, days: [] },
          origin: {
            source: "group_area",
            label: null,
            lat: null,
            lng: null,
            accuracy: "approximate",
          },
          travel: {
            mode: "walk",
            maxOneWayMinutes: 20,
            returnMode: null,
            alreadyAtSharedMeetingPoint: false,
          },
          accessibilityHardRequirements: [],
          dietaryHardRequirements: [],
          optionalNote: null,
        },
      }),
      guest,
    );
    expect(screen.getByRole("button", { name: "Creative" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("Legacy (V2) parties", () => {
  it("lets the host switch a collecting party to V3 with a real configure", async () => {
    const submit = view({ ...v2State, members: allReady });
    expect(screen.getByText("This party still uses the current planner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find our plan" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Switch to the new planner" }));
    expect(screen.getByText(/Saving switches this party to the new planner/)).toBeInTheDocument();
    // The V2 config is only a starting draft: today at Le Plateau, 60 minutes.
    expect(screen.getByLabelText(/Today \/ Tonight/)).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Switch to the new planner & save" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]![0]).toMatchObject({
      action: "configure",
      config: {
        version: 3,
        dateSelection: { mode: "today_tonight", candidateDates: ["2026-11-22"] },
        area: { mode: "host_area", label: "Le Plateau", point: { lat: 45.52, lng: -73.58 } },
        duration: { mode: "fixed", minMinutes: 60, maxMinutes: 60 },
      },
    });
    expect(await screen.findByText(/This party now uses the new planner/)).toBeInTheDocument();
  });

  it("never lets a guest save V3 answers before the host switches", () => {
    const submit = view(v2State, guest);
    expect(
      screen.getByText(/answers can only be saved once the host switches/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Waiting for the host to switch this party to the new planner."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add my private answers/ })).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });

  it("keeps legacy results with no V3 claims", () => {
    view(
      { ...v2State, status: "locked", plan: legacyPlan, optionCount: 3, members: allReady },
      guest,
    );
    expect(screen.getByText(/Cost not verified \(map price level only\)/)).toBeInTheDocument();
    expect(screen.getByText(/Opening hours not verified/)).toBeInTheDocument();
    expect(screen.queryByText(/routing provider/)).toBeNull();
  });
});

describe("Lifecycle", () => {
  it("shows an animated, reduced-motion-safe reveal while locking", () => {
    view(v3State({ status: "locking", members: allReady }));
    expect(screen.getByRole("heading", { name: "Finding your plan…" })).toBeInTheDocument();
    expect(document.querySelector(".motion-safe\\:animate-bounce")).not.toBeNull();
  });

  it("renders the V3 card from nested venue cost, booking, attribution and weather", async () => {
    const submit = view(
      v3State({
        status: "locked",
        plan: v3Plan,
        optionCount: 3,
        revision: 9,
        members: allReady,
        venueSource: "curated",
      }),
      guest,
    );
    expect(screen.getByRole("heading", { name: "Parc La Fontaine" })).toBeInTheDocument();
    expect(
      screen.getByText("3819 Avenue Calixa-Lavallée, Montréal, QC H2L 3A7"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Free · verified Nov 22, 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "price source" })).toHaveAttribute(
      "href",
      "https://montreal.ca/en/places/parc-la-fontaine",
    );
    expect(screen.getByText("No booking needed.")).toBeInTheDocument();
    expect(screen.getByText("Opening hours checked for this date and time.")).toBeInTheDocument();
    expect(screen.getByText(/2 h$/)).toBeInTheDocument();
    expect(screen.getByText(/Forecast summary for this time: 3°C/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open-Meteo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ville de Montréal" })).toBeInTheDocument();
    expect(screen.getByText("Nothing is reserved — space isn't guaranteed.")).toBeInTheDocument();
    expect(screen.queryByText(/Accessibility details/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Finalize" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Vote to reroll" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ action: "vote", revision: 9 }));
  });

  it("shows estimates, booking links and unknown cost without inventing amounts", () => {
    view(
      v3State({
        status: "locked",
        members: allReady,
        optionCount: 2,
        plan: {
          ...v3Plan,
          weather: null,
          warnings: ["cost_unknown", "forecast_unknown"],
          venue: {
            ...v3Plan.venue,
            cost: null,
            bookingRequired: "yes",
            bookingUrl: "https://example.org/book",
          },
        },
      }),
    );
    expect(screen.getByText(/Cost unknown — check with the venue/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Booking page" })).toHaveAttribute(
      "href",
      "https://example.org/book",
    );
    expect(screen.getByText(/nothing is reserved for you/)).toBeInTheDocument();
    expect(screen.getByText("Forecast unavailable for this time.")).toBeInTheDocument();
    cleanup();
    view(
      v3State({
        status: "locked",
        members: allReady,
        optionCount: 2,
        plan: {
          ...v3Plan,
          venue: {
            ...v3Plan.venue,
            cost: { ...v3Plan.venue.cost!, free: false, minCad: 12, maxCad: 18 },
          },
        },
      }),
    );
    expect(screen.getByText(/Estimated \$12–\$18 CAD per person/)).toBeInTheDocument();
  });

  it("lets the host reroll and finalize with the current revision", async () => {
    const submit = view(
      v3State({ status: "locked", plan: v3Plan, optionCount: 3, revision: 5, members: allReady }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reroll" }));
    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit).toHaveBeenNthCalledWith(1, { action: "host_reroll", revision: 5 });
    expect(submit).toHaveBeenNthCalledWith(2, { action: "finalize", revision: 5 });
  });

  it("downloads a calendar file for the final plan without any calendar write", async () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:plan");
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    view(v3State({ status: "final", plan: v3Plan, optionCount: 3, members: allReady }), guest);
    expect(screen.getByText("Confirmed by the host. See you there.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add to calendar/ }));
    expect(click).toHaveBeenCalled();
    // jsdom's Blob has no text(); read it the long way.
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(createObjectURL.mock.calls[0]![0]);
    });
    expect(text).toContain("DTSTART:20261124T230000Z");
    expect(text).toContain("SUMMARY:Baggle: Parc La Fontaine");
    expect(text).toContain("LOCATION:3819 Avenue Calixa-Lavallée\\, Montréal\\, QC H2L 3A7");
  });

  it("shows only the server's neutral suggestions on no-plan and lets the host reopen", async () => {
    const submit = view(
      v3State({
        status: "no_plan",
        members: allReady,
        noPlanReason: "no_match",
        suggestedActions: ["expand_dates", "shorten_duration"],
      }),
    );
    expect(screen.getByText("No plan fits everyone yet.")).toBeInTheDocument();
    expect(screen.getByText("Add more days or a wider date range")).toBeInTheDocument();
    expect(screen.getByText("Try a shorter duration")).toBeInTheDocument();
    expect(screen.queryByText(/larger or more flexible area/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Misha (couldn't|can't|blocked)|because/i);
    fireEvent.click(screen.getByRole("button", { name: "Reopen planning" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ action: "reopen" }));
    cleanup();
    view(v3State({ status: "no_plan", members: allReady, noPlanReason: "no_match" }), guest);
    expect(screen.getByText("Waiting for the host to reopen planning.")).toBeInTheDocument();
  });

  it("drops the finished card as soon as planning is reopened", () => {
    const submit = vi.fn().mockResolvedValue(true);
    const { rerender } = render(
      <PlanningV3Experience
        party={party}
        state={v3State({ status: "locked", plan: v3Plan, optionCount: 3, members: allReady })}
        busy={false}
        submit={submit}
        now={NOW}
      />,
    );
    expect(screen.getByRole("heading", { name: "Parc La Fontaine" })).toBeInTheDocument();
    rerender(
      <PlanningV3Experience
        party={party}
        state={v3State({ status: "collecting", members: allReady })}
        busy={false}
        submit={submit}
        now={NOW}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Parc La Fontaine" })).toBeNull();
    expect(screen.getByRole("button", { name: "Find our plan" })).toBeEnabled();
  });
});
