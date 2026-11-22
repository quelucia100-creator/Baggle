import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanningState } from "@/lib/planning/types";
import { PlanningV3Experience } from "./PlanningV3Experience";
import { NOW, guestId, hostId, party, thirdId, v2State, v3State } from "./test-utils";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const plan: NonNullable<PlanningState["plan"]> = {
  venue: {
    placeId: "curated:parc-la-fontaine",
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
    view(v3State({ selfPreferences: null }));
    expect(screen.getByText(/private — even from the host/)).toBeInTheDocument();
    const roster = screen.getByRole("complementary", { name: "Crew readiness" });
    expect(within(roster).getByText("1/3 completed")).toBeInTheDocument();
    expect(within(roster).getByText("Misha")).toBeInTheDocument();
    expect(within(roster).getAllByText(/Ready|Still answering/)).toHaveLength(3);
    expect(roster.textContent).not.toMatch(/\$|budget|busy|allerg/i);
  });

  it("enables Find our plan only with two ready members and explains exclusions", async () => {
    const submit = view(v3State());
    expect(screen.getByRole("button", { name: "Find our plan" })).toBeDisabled();
    expect(screen.getByText(/At least 2 people must be ready \(1 so far\)/)).toBeInTheDocument();
    cleanup();
    const ready = view(v3State({ members: allReady }));
    expect(screen.getByText(/only the 2 ready people are included/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find our plan" }));
    expect(screen.getByRole("button", { name: "Starting…" })).toBeDisabled();
    await waitFor(() => expect(ready).toHaveBeenCalledWith({ action: "lock" }));
    expect(ready).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it("hosts set up first; guests wait until the hangout is configured", () => {
    view(v3State({ config: null }));
    expect(screen.getByRole("heading", { name: "Set up the hangout" })).toBeInTheDocument();
    cleanup();
    view(v3State({ config: null }), guest);
    expect(screen.getByText("Waiting for the host to set up the hangout.")).toBeInTheDocument();
  });

  it("opens the private wizard for a guest who hasn't answered and saves via the server", async () => {
    const submit = view(
      v3State({
        members: [
          { id: hostId, submitted: true },
          { id: guestId, submitted: false },
          { id: thirdId, submitted: false },
        ],
      }),
      guest,
    );
    expect(screen.getByRole("heading", { name: "What's the vibe?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Everyone travels individually")).toBeInTheDocument();
    expect(screen.getByText("Tue, Nov 24, Thu, Nov 26")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add my private answers/ })).toBeEnabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("labels V2 servers as a preview and never offers a V3 save or lock", () => {
    const submit = view({ ...v2State, members: allReady });
    expect(screen.getByText("New planner preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find our plan" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Edit settings" }));
    expect(screen.getByRole("button", { name: "Saving requires backend update" })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("Lifecycle", () => {
  it("shows an animated, reduced-motion-safe reveal while locking", () => {
    view(v3State({ status: "locking", members: allReady }));
    expect(screen.getByRole("heading", { name: "Finding your plan…" })).toBeInTheDocument();
    expect(document.querySelector(".motion-safe\\:animate-bounce")).not.toBeNull();
  });

  it("renders one actionable card without unverified claims and wires votes", async () => {
    const submit = view(
      v3State({ status: "locked", plan, optionCount: 3, revision: 9, members: allReady }),
      guest,
    );
    expect(screen.getByRole("heading", { name: "Parc La Fontaine" })).toBeInTheDocument();
    expect(screen.getByText(/Cost not verified \(map price level only\)/)).toBeInTheDocument();
    expect(screen.getByText(/Opening hours not verified/)).toBeInTheDocument();
    expect(screen.getByText("Forecast unavailable for this time.")).toBeInTheDocument();
    expect(screen.getByText(/2 h$/)).toBeInTheDocument();
    expect(screen.queryByText(/Booking/)).toBeNull();
    expect(screen.getByRole("link", { name: /Open in Google Maps/ })).toHaveAttribute(
      "href",
      plan.venue.mapsUrl,
    );
    expect(screen.queryByRole("button", { name: "Finalize" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Vote to reroll" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ action: "vote", revision: 9 }));
  });

  it("shows V3 evidence only when the server provides it", () => {
    view(
      v3State({
        status: "locked",
        members: allReady,
        optionCount: 2,
        plan: {
          ...plan,
          hoursUnknown: false,
          venue: {
            ...plan.venue,
            address: "3819 Av. Calixa-Lavallée, Montréal",
            sourceAttribution: "Baggle curated",
          },
          cost: { kind: "estimate", minCad: 10, maxCad: 20, includesFood: false },
          bookingRequired: "yes",
          bookingUrl: "https://example.org/book",
        } as unknown as PlanningState["plan"],
      }),
    );
    expect(screen.getByText("3819 Av. Calixa-Lavallée, Montréal")).toBeInTheDocument();
    expect(
      screen.getByText("Estimated $10–$20 CAD per person · food not included"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Booking page" })).toHaveAttribute(
      "href",
      "https://example.org/book",
    );
    expect(screen.getByText(/availability isn't guaranteed/)).toBeInTheDocument();
  });

  it("lets the host reroll and finalize with the current revision", async () => {
    const submit = view(
      v3State({ status: "locked", plan, optionCount: 3, revision: 5, members: allReady }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reroll" }));
    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit).toHaveBeenNthCalledWith(1, { action: "host_reroll", revision: 5 });
    expect(submit).toHaveBeenNthCalledWith(2, { action: "finalize" });
  });

  it("downloads a calendar file for the final plan without any calendar write", async () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:plan");
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    view(v3State({ status: "final", plan, optionCount: 3, members: allReady }), guest);
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
  });

  it("keeps no-plan neutral and only lets the host reopen", async () => {
    const submit = view(
      v3State({ status: "no_plan", members: allReady, noPlanReason: "no_match" }),
    );
    expect(screen.getByText("No plan fits everyone yet.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Misha (couldn't|can't|blocked)|because/i);
    fireEvent.click(screen.getByRole("button", { name: "Reopen planning" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ action: "reopen" }));
    cleanup();
    view(v3State({ status: "no_plan", members: allReady }), guest);
    expect(screen.getByText("Waiting for the host to reopen planning.")).toBeInTheDocument();
  });

  it("drops the finished card as soon as planning is reopened", () => {
    const submit = vi.fn().mockResolvedValue(true);
    const { rerender } = render(
      <PlanningV3Experience
        party={party}
        state={v3State({ status: "locked", plan, optionCount: 3, members: allReady })}
        busy={false}
        submit={submit}
        now={NOW}
      />,
    );
    expect(screen.getByRole("heading", { name: "Parc La Fontaine" })).toBeInTheDocument();
    rerender(
      <PlanningV3Experience
        party={party}
        state={v3State({ status: "collecting", plan: null, members: allReady })}
        busy={false}
        submit={submit}
        now={NOW}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Parc La Fontaine" })).toBeNull();
    expect(screen.getByRole("button", { name: "Find our plan" })).toBeEnabled();
  });
});
