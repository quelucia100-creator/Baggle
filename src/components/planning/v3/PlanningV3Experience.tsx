import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Settings2 } from "lucide-react";
import { PopButton } from "@/components/Field";
import type { PartyState } from "@/lib/party";
import type { PlanningState } from "@/lib/planning/types";
import {
  ALCOHOL_LABELS,
  TRAVEL_LABELS,
  backendSupportsV3,
  type HostConfigV3,
  type MemberPreferencesV3,
  type PlanningCommandV3,
  type PlanningStateV3,
} from "./contract";
import { HostSetupV3 } from "./HostSetupV3";
import {
  emptyHostDraft,
  formatDuration,
  hostDraftFromV2,
  hostDraftFromV3,
  selectedDates,
  type HostDraft,
} from "./host-model";
import {
  CrewRoster,
  LobbyActions,
  NoPlanV3,
  PrivacyWelcome,
  ResultV3,
  RevealV3,
} from "./LifecycleV3";
import {
  emptyMemberDraft,
  memberDraftFromV3,
  type MemberContext,
  type MemberDraft,
} from "./member-model";
import { MemberWizardV3 } from "./MemberWizardV3";
import { formatDate, todayIn } from "./time";

function useNow(fixed?: number) {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [fixed]);
  return fixed ?? now;
}

function memberContextFrom(draft: HostDraft, today: string, now: number): MemberContext {
  return {
    availabilityMode: draft.dateMode === "today_tonight" ? "tonight" : "calendar",
    candidateDates: selectedDates(draft, today),
    sharedTravel: draft.travelMode === "together",
    groupArea: draft.areaMode === "host_area" ? draft.area : null,
    freeOnly: draft.freeOnly,
    now,
  };
}

/**
 * V3 planning screens. Persists only when the server advertises `schemaVersion: 3`; on
 * the current V2 server it runs as a clearly labelled preview where drafts stay on screen
 * and every save control explains that it requires the backend update.
 */
export function PlanningV3Experience({
  party,
  state,
  busy,
  submit,
  now: fixedNow,
  onExitPreview,
}: {
  party: PartyState;
  state: PlanningState | PlanningStateV3;
  busy: boolean;
  submit: (command: PlanningCommandV3) => Promise<boolean>;
  now?: number | undefined;
  onExitPreview?: (() => void) | undefined;
}) {
  const now = useNow(fixedNow);
  const today = todayIn(now);
  const v3 = backendSupportsV3(state);
  const savedConfig: HostDraft | null = useMemo(() => {
    if (v3) return state.config ? hostDraftFromV3(state.config) : null;
    return hostDraftFromV2((state as PlanningState).config, today);
  }, [v3, state, today]);
  const savedPreferences = v3 ? state.selfPreferences : null;
  const selfReady = state.members.some((member) => member.id === party.selfId && member.submitted);
  const [view, setView] = useState<"overview" | "private" | "setup">(() =>
    party.isHost
      ? v3 && !state.config
        ? "setup"
        : "overview"
      : selfReady
        ? "overview"
        : "private",
  );
  const [hostDraft, setHostDraft] = useState<HostDraft>(() => savedConfig ?? emptyHostDraft());
  const [ownDraft, setOwnDraft] = useState<MemberDraft>(() =>
    savedPreferences ? memberDraftFromV3(savedPreferences) : emptyMemberDraft(),
  );
  const [success, setSuccess] = useState("");
  useEffect(() => {
    window.scrollTo?.({ top: 0, behavior: "instant" });
  }, [state.status, view]);

  const context = savedConfig ? memberContextFrom(savedConfig, today, now) : null;
  const saveConfig = async (config: HostConfigV3) => {
    const confirmed = await submit({ action: "configure", config });
    if (confirmed) {
      setSuccess("Hangout settings saved for the crew.");
      setView("overview");
    }
    return confirmed;
  };
  const savePreferences = async (preferences: MemberPreferencesV3) => {
    const confirmed = await submit({ action: "save", preferences });
    if (confirmed) {
      setSuccess("Your answers are saved. You're ready!");
      setView("overview");
    }
    return confirmed;
  };

  const heading =
    state.status === "final"
      ? "It's a plan."
      : state.status === "collecting"
        ? "Make a plan."
        : "Make time for the crew.";
  return (
    <>
      {!v3 && (
        <div
          role="note"
          className="paper mb-6 rounded-lg border-2 border-dashed border-crust bg-apricot p-4 text-sm"
        >
          <p className="font-extrabold">New planner preview</p>
          <p className="mt-1">
            This server still runs the current planner, so new answers and settings can't be saved
            yet (requires backend update). Plan results, votes and finalizing below are live.
          </p>
          {onExitPreview && (
            <button
              type="button"
              onClick={onExitPreview}
              className="mt-2 font-bold underline underline-offset-4"
            >
              Back to the current planner
            </button>
          )}
        </div>
      )}
      <div className="mb-6">
        <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">
          {party.isHost ? "You're the host" : "Your crew's event"} · {party.code}
        </p>
        <h1 className="text-3xl font-extrabold sm:text-4xl">{heading}</h1>
      </div>
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)] lg:gap-12">
        <div className="min-w-0 space-y-8">
          {state.status === "collecting" ? (
            view === "setup" && party.isHost ? (
              <HostSetupV3
                draft={hostDraft}
                onDraft={setHostDraft}
                today={today}
                canSave={v3}
                busy={busy}
                save={saveConfig}
                onCancel={() => setView("overview")}
              />
            ) : view === "private" && context ? (
              <MemberWizardV3
                draft={ownDraft}
                onDraft={setOwnDraft}
                context={context}
                canSave={v3}
                busy={busy}
                hasSaved={!!savedPreferences}
                save={savePreferences}
                onCancel={() => setView("overview")}
              />
            ) : (
              <Overview
                party={party}
                config={savedConfig}
                today={today}
                selfReady={selfReady}
                success={success}
                busy={busy}
                onSetup={() => {
                  setSuccess("");
                  setView("setup");
                }}
                onPrivate={() => {
                  setSuccess("");
                  setView("private");
                }}
              />
            )
          ) : state.status === "locking" ? (
            <RevealV3 isHost={party.isHost} busy={busy} submit={submit} />
          ) : state.status === "no_plan" ? (
            <NoPlanV3 isHost={party.isHost} busy={busy} submit={submit} />
          ) : state.plan ? (
            <ResultV3 party={party} state={state} busy={busy} submit={submit} />
          ) : (
            <p role="status">The selected plan isn't available. Checking for updates…</p>
          )}
        </div>
        <aside
          className="min-w-0 border-t-2 border-crust/20 pt-6 lg:border-t-0 lg:pt-0"
          aria-label="Crew readiness"
        >
          <CrewRoster party={party} state={state} />
          {state.status === "collecting" && (
            <LobbyActions
              party={party}
              state={state}
              busy={busy || (!v3 && party.isHost)}
              submit={submit}
              selfReady={selfReady}
            />
          )}
          {state.status === "collecting" && !v3 && party.isHost && (
            <p className="mt-2 text-xs font-bold">
              Finding a plan from the preview requires the backend update.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

function Overview({
  party,
  config,
  today,
  selfReady,
  success,
  busy,
  onSetup,
  onPrivate,
}: {
  party: PartyState;
  config: HostDraft | null;
  today: string;
  selfReady: boolean;
  success: string;
  busy: boolean;
  onSetup: () => void;
  onPrivate: () => void;
}) {
  const dates = config ? selectedDates(config, today) : [];
  return (
    <div className="space-y-7">
      {success && (
        <p
          role="status"
          className="paper flex items-center gap-3 rounded-lg border-2 border-crust bg-sage p-4 text-sm font-bold"
        >
          <Check aria-hidden="true" className="h-5 w-5 shrink-0" />
          {success}
        </p>
      )}
      <PrivacyWelcome />
      <section aria-label="Shared hangout settings" className="border-b-2 border-crust/15 pb-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold">The hangout</h2>
          {party.isHost && (
            <button
              type="button"
              disabled={busy}
              onClick={onSetup}
              className="paper flex min-h-11 items-center gap-2 rounded-lg border-2 border-crust bg-cream px-3 text-sm font-bold disabled:opacity-50"
            >
              <Settings2 aria-hidden="true" className="h-4 w-4" />
              {config ? "Edit settings" : "Set up"}
            </button>
          )}
        </div>
        {config ? (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">When</dt>
            <dd className="font-bold">
              {config.dateMode === "today_tonight"
                ? "Today / tonight"
                : config.dateMode === "best_day"
                  ? `Best day between ${formatDate(dates[0]!)} and ${formatDate(dates.at(-1)!)}`
                  : dates.map(formatDate).join(", ")}
            </dd>
            <dt className="text-muted-foreground">Where</dt>
            <dd className="break-words">
              {config.areaMode === "optimize_for_group"
                ? "The app finds a convenient area"
                : `${config.area?.label ?? "Not set"}${config.areaStrict ? " (strict)" : ""}`}
            </dd>
            <dt className="text-muted-foreground">How long</dt>
            <dd>
              {config.durationMode === "fixed"
                ? formatDuration(config.fixedMinutes)
                : `${formatDuration(config.minMinutes)} – ${formatDuration(config.maxMinutes)}`}
            </dd>
            <dt className="text-muted-foreground">Travel</dt>
            <dd>
              {config.travelMode === "together" && config.meetingPoint && config.sharedMode
                ? `Together from ${config.meetingPoint.label} by ${TRAVEL_LABELS[config.sharedMode].toLowerCase()}`
                : "Everyone travels individually"}
            </dd>
            <dt className="text-muted-foreground">Rules</dt>
            <dd>
              {[
                config.under18Friendly && "Under-18 friendly",
                config.alcoholPolicy !== "allow" && ALCOHOL_LABELS[config.alcoholPolicy].title,
                config.freeOnly && "Free only",
                config.requiredAccessibility.length &&
                  `${config.requiredAccessibility.length} accessibility needs`,
                config.dietaryHardRequirements.length &&
                  `${config.dietaryHardRequirements.length} dietary needs`,
              ]
                .filter(Boolean)
                .join(" · ") || "None"}
            </dd>
          </dl>
        ) : (
          <p role="status" className="text-sm font-bold">
            {party.isHost
              ? "Set up the hangout so the crew can answer."
              : "Waiting for the host to set up the hangout."}
          </p>
        )}
      </section>
      {config && (
        <section aria-label="My readiness">
          <h2 className="text-2xl font-extrabold">
            {selfReady ? "You're in. Time for the crew." : "Your turn — a few private questions."}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {party.isHost
              ? "Hosts answer too, just like everyone else. You can edit your answers until the plan is found."
              : "You can edit your answers until the host finds the plan."}
          </p>
          <PopButton
            tone={selfReady ? "sage" : "tangerine"}
            disabled={busy}
            className="mt-5 flex items-center justify-center gap-2"
            onClick={onPrivate}
          >
            {selfReady ? "Edit my private answers" : "Add my private answers"}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </PopButton>
        </section>
      )}
    </div>
  );
}
