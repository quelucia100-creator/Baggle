import { createFileRoute, Link, useHydrated, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, type ComponentProps } from "react";
import { PartyHeader } from "@/components/PartyHeader";
import { PopButton } from "@/components/Field";
import { PlanningExperience } from "@/components/planning/PlanningExperience";
import { PlanWizard } from "@/components/planning/PlanWizard";
import { LegacyPlanWizard } from "@/components/planning/LegacyPlanWizard";
import { planSteps as legacyPlanSteps } from "@/lib/planning/legacy-wizard";
import { planSteps, type PlanStep } from "@/lib/planning/wizard";
import { planningError, type PlanningCommand } from "@/components/planning/model";
import { PlanningV3Experience } from "@/components/planning/v3/PlanningV3Experience";
import {
  backendSupportsV3,
  type PlanningCommandV3,
  type VersionedPlanningState,
} from "@/components/planning/v3/contract";
import { accessParty, membershipToken } from "@/lib/party";
import { updatePartyPlanning } from "@/lib/planning.functions";
import { isPlanningDaysUnavailable, planningDaysKey, planningDaysQuery } from "@/lib/planning-days";
import type { PlanningRequest } from "@/lib/planning-v3/request";

type Command = PlanningCommand | PlanningCommandV3;
type VersionedCall = (options: { data: PlanningRequest }) => Promise<VersionedPlanningState>;
/**
 * Every request carries the party's planning version. A V3 `configure` on a legacy party
 * is the host's bootstrap into V3; every other command follows the version last read.
 */
export function planningRequest(
  command: Command,
  current: VersionedPlanningState | undefined,
  code: string,
  token: string,
): PlanningRequest {
  const bootstrap =
    command.action === "configure" && "version" in command.config && command.config.version === 3;
  if (bootstrap || current?.schemaVersion === 3)
    return { ...command, code, token, schemaVersion: 3 } as PlanningRequest;
  return { ...command, code, token, schemaVersion: 2 } as PlanningRequest;
}

export const Route = createFileRoute("/party/$code_/plan")({
  head: ({ params }) => ({
    meta: [
      { title: `Plan an event · ${params.code} — Baggle` },
      {
        name: "description",
        content:
          "Privately share your availability and choose one shared event with your Baggle crew.",
      },
      { property: "og:title", content: `Your crew's event · ${params.code} — Baggle` },
      {
        property: "og:description",
        content: "Bring friends together with private preferences and a shared plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // ?step= opens the one-question-per-screen wizard; without it this is the shared results page.
  // Each step is a history entry, so browser Back returns to the previous question.
  validateSearch: (search: Record<string, unknown>): { step?: PlanStep } => {
    const step = planSteps.find((value) => value === search["step"]);
    return step ? { step } : {};
  },
  component: PlanningPage,
});

function PlanningPage() {
  const { code } = Route.useParams();
  const { step } = Route.useSearch();
  const hydrated = useHydrated();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // The backend export is an intersection of the versioned and legacy call signatures;
  // pick the versioned one explicitly so V3 reads and commands type-check.
  const planning = useServerFn(updatePartyPlanning as VersionedCall);
  const [error, setError] = useState("");
  // Screen-local only: never in the URL, storage or query keys.
  const [previewV3, setPreviewV3] = useState(false);
  const partyKey = ["party", code];
  // Capability storage is browser-only. Never put it into keys, URLs or SSR loaders.
  const party = useQuery({
    queryKey: partyKey,
    queryFn: () => accessParty("read", code),
    enabled: hydrated,
    refetchInterval: 3000,
    retry: false,
  });
  const planningKey = ["party-planning", code];
  // selfPreferences stay in this browser's active screen cache, discarded on leaving.
  const mutationKey = ["party-planning-change", code];
  const state = useQuery({
    queryKey: planningKey,
    // Reading as V3 returns either a V3 party or an explicitly versioned legacy party.
    queryFn: () =>
      planning({ data: { action: "read", code, token: membershipToken(), schemaVersion: 3 } }),
    enabled: hydrated && !!party.data && !party.isError,
    refetchInterval: () => (queryClient.isMutating({ mutationKey }) ? false : 3000),
    retry: false,
    gcTime: 0,
  });
  const mutation = useMutation({
    mutationKey,
    gcTime: 0,
    mutationFn: (command: Command) =>
      planning({
        data: planningRequest(
          command,
          queryClient.getQueryData<VersionedPlanningState>(planningKey),
          code,
          membershipToken(),
        ),
      }),
    onMutate: async () => {
      setError("");
      await queryClient.cancelQueries({ queryKey: planningKey });
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(planningKey, data);
      await queryClient.invalidateQueries({ queryKey: planningKey });
    },
    onError: async (err) => {
      setError(planningError(err));
      // A failed response may still have completed a lock/vote. Read before retrying.
      await state.refetch();
      await party.refetch();
    },
    retry: false,
  });
  const back = useMutation({
    mutationFn: () => accessParty("team", code),
    onSuccess: async (data) => {
      queryClient.setQueryData(partyKey, data);
      await navigate({ to: "/party/$code", params: { code } });
    },
    onError: () => setError("Couldn't return to your team. Check your connection and try again."),
  });
  const busy = mutation.isPending || back.isPending;
  const goToStep = useCallback(
    (next: PlanStep, replace = false) =>
      void navigate({ to: "/party/$code/plan", params: { code }, search: { step: next }, replace }),
    [navigate, code],
  );
  const toMap = useCallback(
    (replace = false) => void navigate({ to: "/party/$code/map", params: { code }, replace }),
    [navigate, code],
  );
  // Resolves true only after the server confirms the change.
  const submit = async (command: Command) => {
    if (busy || state.isError) return false;
    try {
      await mutation.mutateAsync(command);
      return true;
    } catch {
      return false;
    }
  };
  return (
    <div className="paper-sheet min-h-screen bg-offwhite">
      <PartyHeader
        code={code}
        party={party.isError ? undefined : party.data}
        plan
        busy={busy || !party.data || party.isError}
        onTeam={() => back.mutate()}
      />
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-10 sm:py-12">
        {error && (
          <div
            role="alert"
            className="paper mb-6 rounded-lg border-2 border-crust bg-apricot p-4 text-sm font-semibold"
          >
            {error}
          </div>
        )}
        {party.isError ? (
          <section>
            <h1 className="text-2xl font-extrabold">Let's find your crew.</h1>
            <p className="mt-4">
              Join this party to open its event, or check your connection if you're already a
              member.
            </p>
            <Link
              to="/party/$code"
              params={{ code }}
              className="mt-5 inline-block font-bold underline underline-offset-4"
            >
              Return to party {code}
            </Link>
          </section>
        ) : !party.data ? (
          <p role="status">Opening your party…</p>
        ) : state.isError && !state.data ? (
          <section>
            <h1 className="text-2xl font-extrabold">Couldn't check the event.</h1>
            <p role="alert" className="mt-4">
              Check your connection and party membership. No private answers are shown until access
              is confirmed.
            </p>
            <PopButton
              tone="sage"
              disabled={state.isFetching}
              className="mt-5 max-w-sm"
              onClick={() => void state.refetch()}
            >
              Check again
            </PopButton>
            <Link to="/party/$code" params={{ code }} className="mt-5 block font-bold underline">
              Return to party
            </Link>
          </section>
        ) : !state.data ? (
          <p role="status">Opening your event…</p>
        ) : (
          <>
            {state.isError && (
              <div role="alert" className="mb-6 border-2 border-crust bg-apricot p-4">
                <p className="text-sm">
                  Couldn't refresh the event. Your edits are kept; check again before making a
                  change.
                </p>
                <PopButton
                  tone="sage"
                  disabled={state.isFetching}
                  className="mt-3 max-w-sm"
                  onClick={() => void state.refetch()}
                >
                  Check again
                </PopButton>
              </div>
            )}
            <div role="status" aria-live="polite" className="mb-4 min-h-5 text-sm font-bold">
              {mutation.isPending
                ? mutation.variables?.action === "lock"
                  ? "Finding your shared plan…"
                  : "Saving your change…"
                : ""}
            </div>
            {backendSupportsV3(state.data) || previewV3 ? (
              <PlanningV3Experience
                key={party.data.selfId}
                party={party.data}
                state={state.data}
                busy={busy || state.isError}
                submit={submit}
                onExitPreview={
                  backendSupportsV3(state.data) ? undefined : () => setPreviewV3(false)
                }
              />
            ) : state.data.status === "collecting" ? (
              // While answers are open, every entry point (including "Plan an event") uses the
              // slider wizard; a bare /plan starts at the first step.
              <>
                <button
                  type="button"
                  onClick={() => setPreviewV3(true)}
                  className="mx-auto mb-4 block text-sm font-bold underline underline-offset-4"
                >
                  {party.data.isHost ? "Switch to the new planner" : "Preview the new planner"}
                </button>
                <SliderWizard
                  key={party.data.selfId}
                  code={code}
                  party={party.data}
                  state={state.data}
                  {...(step ? { step } : {})}
                  goToStep={goToStep}
                  exit={() => toMap()}
                  finish={() => {
                    void queryClient.invalidateQueries({ queryKey: planningKey });
                    // A host who just finished setting up goes to the lobby to invite the crew.
                    if (party.data.isHost && party.data.members.length === 1)
                      void navigate({ to: "/party/$code", params: { code }, replace: true });
                    else toMap(true);
                  }}
                />
              </>
            ) : step ? (
              <section className="paper mx-auto max-w-md rounded-2xl border-2 border-crust bg-offwhite p-6 shadow-pop">
                <h1 className="text-2xl font-extrabold">Planning is locked</h1>
                <p className="mt-3 text-sm">
                  The host is already finding or has found the hangout, so answers can't change
                  right now.
                </p>
                <PopButton tone="sage" className="mt-6" onClick={() => toMap()}>
                  Back to map
                </PopButton>
                <Link
                  to="/party/$code/plan"
                  params={{ code }}
                  className="mt-4 block text-center font-bold underline underline-offset-4"
                >
                  See the plan
                </Link>
              </section>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setPreviewV3(true)}
                  className="mb-4 text-sm font-bold underline underline-offset-4"
                >
                  Preview the new planner
                </button>
                <PlanningExperience
                  key={party.data.selfId}
                  party={party.data}
                  state={state.data}
                  busy={busy || state.isError}
                  submit={submit}
                />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

type WizardProps = Omit<ComponentProps<typeof PlanWizard>, "days" | "step"> & { step?: PlanStep };
/** Loads the host's offered days (and host readiness) only while the slider wizard is open. */
function SliderWizard(props: WizardProps) {
  const queryClient = useQueryClient();
  const days = useQuery(planningDaysQuery(props.code));
  if (!days.data && isPlanningDaysUnavailable(days.error))
    return <LegacyPlanWizard {...props} step={props.step ?? legacyPlanSteps[0]} />;
  // A failed background poll keeps the wizard (and its draft) on screen.
  if (!days.data && days.isError)
    return (
      <section className="mx-auto max-w-md">
        <p role="alert" className="font-bold">
          Couldn't check the hangout's days. Check your connection and try again.
        </p>
        <PopButton tone="sage" className="mt-4" onClick={() => void days.refetch()}>
          Check again
        </PopButton>
      </section>
    );
  if (!days.data) return <p role="status">Opening your event…</p>;
  return (
    <PlanWizard
      {...props}
      step={props.step ?? planSteps[0]}
      days={days.data}
      finish={() => {
        void queryClient.invalidateQueries({ queryKey: planningDaysKey(props.code) });
        props.finish();
      }}
    />
  );
}
