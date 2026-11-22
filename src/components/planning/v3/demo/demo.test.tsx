/** Tests for the LOCAL DEMO harness. Synthetic data only; no network, no database. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoApp } from "./DemoApp";
import { DemoPlanningServer } from "./fake-server";
import { HOST_ID, MISHA_ID, SAM_ID, SCENARIOS, syntheticAnswers } from "./fixtures";

vi.setConfig({ testTimeout: 20_000 });
afterEach(cleanup);

describe("Demo fake server", () => {
  it.each(SCENARIOS.map((entry) => entry.id))("loads the %s fixture", (scenario) => {
    const server = new DemoPlanningServer(scenario);
    const state = server.read(HOST_ID);
    expect(state.status).toBe("collecting");
    expect(state.schemaVersion).toBe(scenario === "legacy" ? 2 : 3);
    server.dispose();
  });

  it("returns only the caller's own private answers", () => {
    const server = new DemoPlanningServer("multi");
    const misha = server.read(MISHA_ID);
    const host = server.read(HOST_ID);
    expect(misha.schemaVersion === 3 && misha.selfPreferences).toBeTruthy();
    expect(host.schemaVersion === 3 && host.selfPreferences).toBeNull();
    expect(JSON.stringify(host)).not.toContain('"preferredMaxCad"');
    server.dispose();
  });

  it("runs save → lock → result → reroll → vote → finalize with server rules", () => {
    vi.useFakeTimers();
    const server = new DemoPlanningServer("overnight");
    const read = () => server.read(HOST_ID);
    expect(() => server.handle(HOST_ID, { action: "lock" })).toThrow(/own preferences/);
    const config = scenarioConfigOf(server);
    server.handle(HOST_ID, {
      action: "save",
      preferences: syntheticAnswers(SAM_ID, config, Date.now()),
    });
    expect(() => server.handle(MISHA_ID, { action: "lock" })).toThrow(/Only the host/);
    server.handle(HOST_ID, { action: "lock" });
    expect(read().status).toBe("locking");
    vi.advanceTimersByTime(server.lockDelayMs);
    const locked = read();
    expect(locked.status).toBe("locked");
    expect(locked.optionCount).toBe(3);
    expect(() => server.handle(HOST_ID, { action: "host_reroll", revision: 0 })).toThrow(/changed/);
    server.handle(HOST_ID, { action: "host_reroll", revision: locked.revision });
    expect(read().planIndex).toBe(1);
    server.handle(MISHA_ID, { action: "vote", revision: read().revision });
    expect(read().planIndex).toBe(2);
    server.handle(HOST_ID, { action: "finalize", revision: read().revision });
    expect(read().status).toBe("final");
    server.dispose();
    vi.useRealTimers();
  });

  it("produces a neutral no-plan for the no-match fixture and allows reopen", () => {
    vi.useFakeTimers();
    const server = new DemoPlanningServer("nomatch");
    server.quickFill(MISHA_ID);
    expect(() => server.handle(HOST_ID, { action: "lock" })).not.toThrow();
    vi.advanceTimersByTime(server.lockDelayMs);
    const state = server.read(MISHA_ID);
    expect(state.status).toBe("no_plan");
    expect(state.noPlanReason).toBe("no_match");
    server.handle(HOST_ID, { action: "reopen" });
    expect(server.read(HOST_ID).status).toBe("collecting");
    server.dispose();
    vi.useRealTimers();
  });

  it("rejects invalid answers with the backend validator", () => {
    const server = new DemoPlanningServer("tonight");
    const good = syntheticAnswers(SAM_ID, scenarioConfigOf(server), Date.now());
    expect(() =>
      server.handle(SAM_ID, { action: "save", preferences: { ...good, vibes: [] } }),
    ).toThrow();
    server.dispose();
  });

  it("bootstraps the legacy fixture into V3 through configure", () => {
    const server = new DemoPlanningServer("legacy");
    const other = new DemoPlanningServer("tonight");
    server.handle(HOST_ID, { action: "configure", config: scenarioConfigOf(other) });
    expect(server.read(HOST_ID).schemaVersion).toBe(3);
    server.dispose();
    other.dispose();
  });
});

function scenarioConfigOf(server: DemoPlanningServer) {
  const state = server.read(HOST_ID);
  if (state.schemaVersion !== 3) throw new Error("expected V3");
  return state.config;
}

describe("Demo app shell", () => {
  it("always shows the LOCAL DEMO banner and the real planning screen", () => {
    render(<DemoApp initialScenario="multi" />);
    expect(screen.getByText("LOCAL DEMO — SYNTHETIC DATA")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Make a plan." })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Simulated person" })).toBeInTheDocument();
  });
});
