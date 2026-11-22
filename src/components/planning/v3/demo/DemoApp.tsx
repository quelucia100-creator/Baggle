/**
 * LOCAL DEMO ONLY — interactive harness around the REAL V3 planning screens.
 * Every response comes from DemoPlanningServer (in memory, synthetic). Nothing is sent anywhere.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, Clock, FlaskConical, RotateCcw, ShieldAlert, Users } from "lucide-react";
import { PlanningV3Experience } from "../PlanningV3Experience";
import type { PlanningCommandV3 } from "../contract";
import { DemoPlanningServer } from "./fake-server";
import { DEMO_PEOPLE, HOST_ID, SCENARIOS, demoParty, type ScenarioId } from "./fixtures";
import { blockedRequests, onBlocked } from "./network-guard";

const LATENCY_MS = 450;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function DemoApp({ initialScenario = "tonight" }: { initialScenario?: ScenarioId }) {
  const [scenario, setScenario] = useState<ScenarioId>(initialScenario);
  const server = useMemo(() => new DemoPlanningServer(initialScenario), [initialScenario]);
  useEffect(() => () => server.dispose(), [server]);
  const version = useSyncExternalStore(server.subscribe, () => server.version);
  const blocked = useSyncExternalStore(onBlocked, () => blockedRequests.length);
  const [selfId, setSelfId] = useState<string>(HOST_ID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failNext, setFailNext] = useState(false);
  const [mount, setMount] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const state = useMemo(() => server.read(selfId), [server, selfId, version]);
  const party = demoParty(selfId);

  const submit = async (command: PlanningCommandV3) => {
    setError("");
    setBusy(true);
    await wait(LATENCY_MS);
    try {
      if (failNext) {
        setFailNext(false);
        throw new Error("Simulated network failure (demo toggle). Nothing was changed.");
      }
      server.handle(selfId, command);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The simulated request failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const loadScenario = (next: ScenarioId) => {
    setScenario(next);
    server.reset(next);
    setSelfId(HOST_ID);
    setError("");
    setMount((value) => value + 1);
  };

  return (
    <div className="paper-sheet min-h-screen bg-offwhite">
      <div
        role="banner"
        className="sticky top-0 z-50 border-b-4 border-crust bg-destructive px-4 py-2 text-center text-offwhite"
      >
        <p className="flex items-center justify-center gap-2 font-display text-base font-extrabold tracking-wide sm:text-lg">
          <ShieldAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
          LOCAL DEMO — SYNTHETIC DATA
        </p>
        <p className="text-xs font-semibold">
          Nothing is saved to a server. Plans are fixtures, not matching-engine results. External
          requests blocked: {blocked}
        </p>
      </div>

      <section
        aria-label="Demo controls"
        className="border-b-2 border-dashed border-crust/40 bg-cream px-5 py-4 sm:px-10"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="block min-w-0 lg:w-72">
            <span className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
              <FlaskConical aria-hidden="true" className="h-4 w-4" />
              Scenario fixture
            </span>
            <select
              value={scenario}
              onChange={(event) => loadScenario(event.target.value as ScenarioId)}
              className="paper h-12 w-full rounded-2xl border-2 border-crust bg-offwhite px-4 font-bold focus:outline-none focus:ring-4 focus:ring-vista/40"
            >
              {SCENARIOS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs">
              {SCENARIOS.find((entry) => entry.id === scenario)?.note}
            </span>
          </label>
          <div className="min-w-0">
            <p className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
              <Users aria-hidden="true" className="h-4 w-4" />
              Viewing as
            </p>
            <div role="group" aria-label="Simulated person" className="flex flex-wrap gap-2">
              {DEMO_PEOPLE.map((person) => {
                const ready = state.members.find((member) => member.id === person.id)?.submitted;
                return (
                  <button
                    key={person.id}
                    type="button"
                    aria-pressed={selfId === person.id}
                    onClick={() => {
                      setError("");
                      setSelfId(person.id);
                    }}
                    className={`paper flex min-h-11 items-center gap-2 rounded-lg border-2 border-crust px-3 text-sm font-bold ${selfId === person.id ? "bg-chartreuse shadow-pop" : "bg-offwhite hover:bg-apricot"}`}
                  >
                    {ready ? (
                      <Check aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <Clock aria-hidden="true" className="h-4 w-4" />
                    )}
                    {person.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => server.quickFill(selfId)}
              disabled={state.status !== "collecting" || state.schemaVersion !== 3}
              className="paper min-h-11 rounded-lg border-2 border-crust bg-sage px-3 text-sm font-bold disabled:opacity-40"
            >
              Fill others with synthetic answers
            </button>
            <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={failNext}
                onChange={(event) => setFailNext(event.target.checked)}
                className="h-5 w-5 accent-[var(--crust)]"
              />
              Fail next request
            </label>
            <button
              type="button"
              onClick={() => loadScenario(scenario)}
              className="paper flex min-h-11 items-center gap-2 rounded-lg border-2 border-crust bg-offwhite px-3 text-sm font-bold"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>
        <p className="mx-auto mt-3 max-w-6xl text-xs">
          Switching person shows exactly what that person's planning screen would read: their own
          answers only. Unsaved drafts belong to the screen you leave.
        </p>
      </section>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-10 sm:py-12">
        {error && (
          <div
            role="alert"
            className="paper mb-6 rounded-lg border-2 border-crust bg-apricot p-4 text-sm font-semibold"
          >
            {error}
          </div>
        )}
        {(state.status === "locked" || state.status === "final") && (
          <p
            role="note"
            className="mb-4 rounded-lg border-2 border-dashed border-crust bg-apricot p-3 text-sm font-bold"
          >
            Synthetic fixture plan: the venue, address, price, hours, booking, routing and weather
            statements on this card are invented to exercise the UI. They were not produced or
            verified by the matching engine or any provider.
          </p>
        )}
        <div role="status" aria-live="polite" className="mb-4 min-h-5 text-sm font-bold">
          {busy ? "Saving your change… (simulated)" : ""}
        </div>
        <PlanningV3Experience
          key={`${mount}-${selfId}`}
          party={party}
          state={state}
          busy={busy}
          submit={submit}
        />
        <details className="mt-12 border-t-2 border-dashed border-crust/40 pt-4 text-sm">
          <summary className="cursor-pointer font-bold">Simulated server log (demo only)</summary>
          <ol className="mt-3 space-y-1 text-xs">
            {server.events.map((event, index) => (
              <li key={`${event.at}-${index}`}>
                <time className="font-bold">{new Date(event.at).toLocaleTimeString()}</time> ·{" "}
                {event.text}
              </li>
            ))}
          </ol>
        </details>
      </main>
    </div>
  );
}
