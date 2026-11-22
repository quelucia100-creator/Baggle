/**
 * LOCAL DEMO ONLY — an in-memory stand-in for the `party_plan` RPC.
 * It mirrors the lifecycle rules the UI depends on (roles, collecting-only edits, revisions,
 * the two-submission lock including the host, three shared rerolls, no-plan and reopen) and
 * validates saves with the backend's real validators. It is NOT the database and proves
 * nothing about persistence, privacy enforcement in SQL, or the matching engine.
 */
import type {
  LegacyPlanningState,
  PlanningCommandV3,
  PlanningStateV3,
  PublicPlanV3,
} from "../contract";
import type { HostConfigV3, MemberPreferencesV3 } from "../contract";
import type { PlanningConfig } from "@/lib/planning/types";
import { normalizeConfig, normalizePreferences } from "@/lib/planning-v3/schema";
import {
  DEMO_PEOPLE,
  HOST_ID,
  MISHA_ID,
  legacyConfig,
  scenarioConfig,
  syntheticAnswers,
  syntheticOptions,
  type ScenarioId,
} from "./fixtures";

type Status = PlanningStateV3["status"];
type Store = {
  scenario: ScenarioId;
  schemaVersion: 2 | 3;
  legacy: PlanningConfig;
  config: HostConfigV3;
  status: Status;
  revision: number;
  answers: Map<string, MemberPreferencesV3>;
  submitted: Set<string>;
  participants: string[];
  options: PublicPlanV3[];
  planIndex: number;
  groupRerollsUsed: number;
  votes: Set<string>;
};
export type DemoEvent = { at: number; text: string };

const NO_MATCH_ACTIONS = [
  "expand_dates",
  "expand_area",
  "shorten_duration",
  "review_own_preferences",
] as const;

export class DemoPlanningServer {
  private store!: Store;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  version = 0;
  events: DemoEvent[] = [];
  /** How long the synthetic "matching" step takes, to show the reveal screen. */
  lockDelayMs = 1800;

  constructor(
    scenario: ScenarioId,
    private readonly now: () => number = Date.now,
  ) {
    this.reset(scenario);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private changed(text: string) {
    this.version++;
    this.events = [{ at: this.now(), text }, ...this.events].slice(0, 40);
    for (const listener of this.listeners) listener();
  }

  reset(scenario: ScenarioId) {
    if (this.timer) clearTimeout(this.timer);
    const now = this.now();
    const config = scenarioConfig(scenario, now);
    const answers = new Map<string, MemberPreferencesV3>();
    const submitted = new Set<string>();
    if (scenario !== "legacy") {
      // Misha has already answered; the host and Sam still need to.
      answers.set(MISHA_ID, syntheticAnswers(MISHA_ID, config, now));
      submitted.add(MISHA_ID);
    }
    this.store = {
      scenario,
      schemaVersion: scenario === "legacy" ? 2 : 3,
      legacy: legacyConfig(now),
      config,
      status: "collecting",
      revision: 1,
      answers,
      submitted,
      participants: [],
      options: [],
      planIndex: 0,
      groupRerollsUsed: 0,
      votes: new Set(),
    };
    this.events = [];
    this.changed(`Scenario "${scenario}" loaded with synthetic data.`);
  }

  /** Fills every unanswered person with synthetic answers (not the person you're viewing). */
  quickFill(except: string) {
    const s = this.store;
    if (s.schemaVersion !== 3 || s.status !== "collecting") return;
    for (const person of DEMO_PEOPLE) {
      if (person.id === except || s.submitted.has(person.id)) continue;
      s.answers.set(person.id, syntheticAnswers(person.id, s.config, this.now()));
      s.submitted.add(person.id);
    }
    this.changed("Synthetic answers filled for the other simulated people.");
  }

  /** What `party_plan('read')` would return to this caller: only their own private answers. */
  read(selfId: string): PlanningStateV3 | LegacyPlanningState {
    const s = this.store;
    const members = DEMO_PEOPLE.map((person) => ({
      id: person.id,
      submitted: s.submitted.has(person.id),
    }));
    const plan =
      s.status === "locked" || s.status === "final" ? (s.options[s.planIndex] ?? null) : null;
    const shared = {
      status: s.status,
      revision: s.revision,
      members,
      planIndex: s.planIndex,
      optionCount: s.options.length,
      groupRerollsUsed: s.groupRerollsUsed,
      votes: s.votes.size,
      voteThreshold: Math.ceil(Math.max(1, s.participants.length) / 2),
      selfVoted: s.votes.has(selfId),
      noPlanReason: s.status === "no_plan" ? ("no_match" as const) : null,
    };
    if (s.schemaVersion === 2)
      return {
        ...shared,
        schemaVersion: 2,
        config: s.legacy,
        selfPreferences: null,
        plan: null,
        venueSource: null,
      };
    return {
      ...shared,
      schemaVersion: 3,
      config: s.config,
      selfPreferences: s.answers.get(selfId) ?? null,
      plan,
      venueSource: plan ? "curated" : null,
      suggestedActions: s.status === "no_plan" ? [...NO_MATCH_ACTIONS] : [],
    };
  }

  /** Applies a command for `selfId`. Throws a user-safe message when the real RPC would reject it. */
  handle(selfId: string, command: PlanningCommandV3) {
    const s = this.store;
    const isHost = selfId === HOST_ID;
    const name = DEMO_PEOPLE.find((person) => person.id === selfId)?.name ?? "Someone";
    const hostOnly = () => {
      if (!isHost) throw new Error("Only the host can do that.");
    };
    const revisionMatches = (revision: number) => {
      if (revision !== s.revision) throw new Error("This plan changed. Refresh and try again.");
    };
    switch (command.action) {
      case "configure": {
        hostOnly();
        if (s.status !== "collecting") throw new Error("Planning configuration is frozen.");
        const config = normalizeConfig(command.config, this.now());
        const datesChanged =
          s.schemaVersion === 2 ||
          config.dateSelection.mode !== s.config.dateSelection.mode ||
          config.dateSelection.candidateDates.join() !==
            s.config.dateSelection.candidateDates.join();
        const bootstrapped = s.schemaVersion === 2;
        s.schemaVersion = 3;
        s.config = config;
        s.revision++;
        if (datesChanged) s.submitted.clear();
        return this.changed(
          bootstrapped
            ? "Host switched the party to the new planner. Everyone's readiness was reset."
            : datesChanged
              ? "Host saved new settings. Dates changed, so everyone must re-confirm."
              : "Host saved new settings.",
        );
      }
      case "save": {
        if (s.schemaVersion !== 3) throw new Error("The host must enable V3 planning first.");
        if (s.status !== "collecting")
          throw new Error("Preferences are frozen until the host reopens planning.");
        if (command.revision !== s.revision)
          throw new Error("This plan changed. Refresh and try again.");
        // The backend's own validator: the same rules a real save is checked against.
        const preferences = normalizePreferences(
          structuredClone(command.preferences),
          s.config,
          this.now(),
        );
        s.answers.set(selfId, preferences);
        s.submitted.add(selfId);
        return this.changed(`${name} saved private answers (contents not shown).`);
      }
      case "lock": {
        hostOnly();
        if (s.schemaVersion !== 3)
          throw new Error("This party requires a compatible planning version.");
        if (s.status !== "collecting") throw new Error("Planning isn't collecting answers.");
        if (!s.submitted.has(HOST_ID))
          throw new Error("Submit your own preferences before locking.");
        if (s.submitted.size < 2) throw new Error("At least 2 members must submit before locking.");
        s.status = "locking";
        s.revision++;
        s.participants = [...s.submitted];
        this.changed(`Host started the search with ${s.participants.length} ready people.`);
        this.timer = setTimeout(() => this.finishLock(), this.lockDelayMs);
        return;
      }
      case "vote": {
        if (s.status !== "locked") throw new Error("There is no open plan to reroll.");
        revisionMatches(command.revision);
        if (s.planIndex + 1 >= s.options.length)
          throw new Error("Last option: there are no more plans.");
        if (!s.participants.includes(selfId)) throw new Error("Submit preferences before voting.");
        if (s.groupRerollsUsed >= 3) throw new Error("Only the host can reroll now.");
        s.votes.add(selfId);
        if (s.votes.size >= Math.ceil(s.participants.length / 2)) {
          this.advance(true);
          return this.changed(
            `${name} voted; the vote passed and the next synthetic option is shown.`,
          );
        }
        return this.changed(`${name} voted to reroll.`);
      }
      case "host_reroll":
        hostOnly();
        if (s.status !== "locked") throw new Error("There is no open plan to reroll.");
        revisionMatches(command.revision);
        if (s.planIndex + 1 >= s.options.length)
          throw new Error("Last option: there are no more plans.");
        this.advance(true);
        return this.changed("Host rerolled to the next synthetic option.");
      case "finalize":
        hostOnly();
        if (s.status !== "locked" && s.status !== "final")
          throw new Error("Only a locked plan can be finalized.");
        revisionMatches(command.revision);
        s.status = "final";
        return this.changed("Host finalized the plan.");
      case "reopen":
        hostOnly();
        if (s.status !== "no_plan") throw new Error("Only a no-plan result can be reopened.");
        s.status = "collecting";
        s.revision++;
        s.options = [];
        s.planIndex = 0;
        s.participants = [];
        return this.changed("Host reopened planning. Saved answers were kept.");
    }
  }

  private advance(countsAsReroll: boolean) {
    const s = this.store;
    s.planIndex++;
    s.revision++;
    s.votes.clear();
    if (countsAsReroll) s.groupRerollsUsed = Math.min(3, s.groupRerollsUsed + 1);
  }

  private finishLock() {
    const s = this.store;
    if (s.status !== "locking") return;
    s.revision++;
    if (s.scenario === "nomatch") {
      s.status = "no_plan";
      return this.changed("Synthetic result: no plan fits everyone (neutral no-match).");
    }
    s.options = syntheticOptions(s.scenario, s.config, this.now());
    s.planIndex = 0;
    s.status = "locked";
    this.changed(
      `Synthetic result: ${s.options.length} fixture options (not from the matching engine).`,
    );
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }
}
