import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Settings2 } from "lucide-react";
import { PopButton } from "@/components/Field";
import type { PartyState } from "@/lib/party";
import {
  ALCOHOL_LABELS,
  TRAVEL_LABELS,
  backendSupportsV3,
  type HostConfigV3,
  type MemberPreferencesV3,
  type PlanningCommandV3,
  type VersionedPlanningState,
} from "./contract";
import { HostSetupV3 } from "./HostSetupV3";
import {
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
    minMinutes: draft.durationMode === "fixed" ? draft.fixedMinutes : draft.minMinutes,
    now,
  };
}

/**
 * V3 planning screens over the versioned `party_plan` RPC.
 * - `schemaVersion: 3` parties: every setting, answer and lifecycle action is persisted.
 * - Legacy (`schemaVersion: 2`) parties in collecting: the host's first V3 `configure`
 *   converts the party (server-side bootstrap); members can't save V3 answers until then.
 * - Legacy parties that are locked/final/no-plan keep their V2 results.
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
  state: VersionedPlanningState;
  busy: boolean;
  submit: (command: PlanningCommandV3) => Promise<boolean>;
  now?: number | undefined;
  onExitPreview?: (() => void) | undefined;
}) {
  const now = useNow(fixedNow);
  const today = todayIn(now);
  const v3 = backendSupportsV3(state);
  const savedConfig: HostDraft = useMemo(
    () => (v3 ? hostDraftFromV3(state.config) : hostDraftFromV2(state.config, today)),
    [v3, state, today],
  );
  const savedPreferences = v3 ? state.selfPreferences : null;
  const selfReady = state.members.some((member) => member.id === party.selfId && member.submitted);
  const collecting = state.status === "collecting";
  const canConfigure = party.isHost && collecting;
  const [view, setView] = useState<"overview" | "private" | "setup">(() =>
    party.isHost || selfReady || !v3 ? "overview" : "private",
  );
  const [hostDraft, setHostDraft] = useState<HostDraft>(() => savedConfig);
  const groupArea = savedConfig.areaMode === "host_area" ? savedConfig.area : null;
  const [ownDraft, setOwnDraft] = useState<MemberDraft>(() =>
    // Retained answers are an owner-only draft; readiness comes from the roster.
    savedPreferences ? memberDraftFromV3(savedPreferences, groupArea) : emptyMemberDraft(),
  );
  const [success, setSuccess] = useState("");
  // The revision the private draft is based on. If the host changes settings meanwhile,
  // the server rejects the save and the member reviews the draft instead of overwriting.
  const [draftRevision, setDraftRevision] = useState(state.revision);
  const latestRevision = useRef(state.revision);
  latestRevision.current = state.revision;
  useEffect(() => {
    window.scrollTo?.({ top: 0, behavior: "instant" });
  }, [state.status, view]);

  const context = memberContextFrom(savedConfig, today, now);
  const saveConfig = async (config: HostConfigV3) => {
    const confirmed = await submit({ action: "configure", config });
    if (confirmed) {
      setSuccess(
        v3
          ? "Hangout settings saved for the crew."
          : "This party now uses the new planner. Everyone, including you, answers the new questions.",
      );
      setView("overview");
    }
    return confirmed;
  };
  const savePreferences = async (preferences: MemberPreferencesV3) => {
    const confirmed = await submit({ action: "save", preferences, revision: draftRevision });
    // After a rejected save the member sees the error and their draft; an explicit retry is
    // based on the latest read (and re-validated against the current settings first).
    if (!confirmed) setDraftRevision(latestRevision.current);
    if (confirmed) {
      setSuccess("Your answers are saved.");
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
          <p className="font-extrabold">This party still uses the current planner</p>
          <p className="mt-1">
            {!collecting
              ? "The plan below came from the current planner. Votes and finalizing still work."
              : party.isHost
                ? "Saving the hangout settings switches the party to the new planner. Everyone's readiness resets and each person, including you, answers the new questions."
                : "You can look around, but answers can only be saved once the host switches this party to the new planner."}
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
          {collecting ? (
            view === "setup" && party.isHost ? (
              <HostSetupV3
                draft={hostDraft}
                onDraft={setHostDraft}
                today={today}
                canSave={canConfigure}
                bootstrap={!v3}
                busy={busy}
                save={saveConfig}
                onCancel={() => setView("overview")}
              />
            ) : view === "private" ? (
              <MemberWizardV3
                draft={ownDraft}
                onDraft={setOwnDraft}
                context={context}
                canSave={v3}
                pendingMessage="Answers can be saved once the host switches this party to the new planner. Your draft stays on this screen only and has not been sent."
                busy={busy}
                hasSaved={selfReady}
                save={savePreferences}
                onCancel={() => setView("overview")}
              />
            ) : (
              <Overview
                party={party}
                config={v3 ? savedConfig : null}
                today={today}
                selfReady={selfReady}
                success={success}
                busy={busy}
                legacy={!v3}
                onSetup={() => {
                  setSuccess("");
                  setView("setup");
                }}
                onPrivate={() => {
                  setSuccess("");
                  setDraftRevision(state.revision);
                  setView("private");
                }}
              />
            )
          ) : state.status === "locking" ? (
            <RevealV3 isHost={party.isHost} busy={busy} submit={submit} />
          ) : state.status === "no_plan" ? (
            <NoPlanV3
              isHost={party.isHost}
              busy={busy}
              submit={submit}
              actions={v3 ? state.suggestedActions : null}
            />
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
          {collecting && (
            <LobbyActions
              party={party}
              state={state}
              busy={busy}
              submit={submit}
              selfReady={selfReady}
              lockAvailable={v3}
            />
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
  legacy,
  onSetup,
  onPrivate,
}: {
  party: PartyState;
  config: HostDraft | null;
  today: string;
  selfReady: boolean;
  success: string;
  busy: boolean;
  legacy: boolean;
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
              {legacy ? "Switch to the new planner" : "Edit settings"}
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
              ? "Set up the hangout in the new planner so the crew can answer."
              : "Waiting for the host to switch this party to the new planner."}
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
