import { createFileRoute, Link, useHydrated, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { toast } from "sonner";
import { PartyHeader } from "@/components/PartyHeader";
import { PopButton } from "@/components/Field";
import { PlanningExperience } from "@/components/planning/PlanningExperience";
import { PlanWizard } from "@/components/planning/PlanWizard";
import { LegacyPlanWizard } from "@/components/planning/LegacyPlanWizard";
import { planSteps, planStepsFor, type PlanStep } from "@/lib/planning/wizard";
import { planningError } from "@/components/planning/model";
import { PlanningV3Experience } from "@/components/planning/v3/PlanningV3Experience";
import { backendSupportsV3 } from "@/components/planning/v3/contract";
import { PartyPlanningActions } from "@/components/planning/PartyPlanningActions";
import {
  usePartyWorkflow,
  workflowReadiness,
  type PartyWorkflow,
} from "@/components/planning/usePartyWorkflow";
import { accessParty } from "@/lib/party";
import { PartyControls, usePartyExit } from "@/components/PartyControls";

export const Route = createFileRoute("/party/$code_/plan")({
  head: () => ({
    meta: [
      { title: `Plan an event — Baggle` },
      {
        name: "description",
        content:
          "Privately share your availability and choose one shared event with your Baggle crew.",
      },
      { property: "og:title", content: `Your crew's event — Baggle` },
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
  validateSearch: (search: Record<string, unknown>): { step?: PlanStep; edit?: true } => {
    const step = planSteps.find((value) => value === search["step"]);
    return step ? { step, ...(search["edit"] === true ? { edit: true } : {}) } : {};
  },
  component: PlanningPage,
});

function PlanningPage() {
  const { code } = Route.useParams();
  const { step, edit } = Route.useSearch();
  const hydrated = useHydrated();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
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
  const workflow = usePartyWorkflow(code, hydrated && !!party.data && !party.isError);
  usePartyExit(code, party.error);
  const { state, days, mutation } = workflow;
  const readiness = party.data && workflowReadiness(party.data, workflow);
  const v3 = backendSupportsV3(state.data);
  const collecting = state.data?.status === "collecting";
  const needsSetup =
    readiness && party.data?.isHost && !readiness.hostReady && !readiness.legacyReady;
  const needsAnswers = readiness && (!readiness.selfReady || needsSetup);
  const showWizard = collecting && (edit || needsAnswers || previewV3);
  useEffect(() => {
    // Saved collecting answers already render the shared view. Let a successful
    // submission return to the lobby without a competing URL replacement.
    if (step && state.data && !state.isError && !collecting)
      void navigate({ to: "/party/$code/plan", params: { code }, search: {}, replace: true });
  }, [step, state.data, state.isError, collecting, navigate, code]);
  const back = useMutation({
    mutationFn: () => accessParty("team", code),
    onMutate: () => queryClient.cancelQueries({ queryKey: partyKey }),
    onSuccess: async (data) => {
      queryClient.setQueryData(partyKey, data);
      await navigate({ to: "/party/$code", params: { code }, replace: true });
    },
    onError: () => setError("Couldn't return to your team. Check your connection and try again."),
  });
  const busy = mutation.isPending || back.isPending;
  const goToStep = useCallback(
    (next: PlanStep, replace = false) =>
      void navigate({
        to: "/party/$code/plan",
        params: { code },
        search: { step: next, ...(edit ? { edit } : {}) },
        replace: replace || !!edit,
      }),
    [navigate, code, edit],
  );
  const finish = async () => {
    await workflow.refresh();
    if (party.data?.view === "map") {
      back.mutate();
    } else {
      await navigate({ to: "/party/$code", params: { code }, replace: true });
    }
  };
  const exit = () => back.mutate();
  const submit: typeof workflow.submit = async (command) => {
    if (back.isPending) return;
    return workflow.submit(command);
  };
  return (
    <div className="paper-sheet min-h-screen bg-offwhite">
      <PartyHeader
        code={code}
        party={party.isError ? undefined : party.data}
        plan
        showCode={readiness?.hostReady === true}
        busy={busy || !party.data || party.isError}
        onTeam={() => back.mutate()}
      />
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-10 sm:py-12">
        {(error || mutation.error) && (
          <div
            role="alert"
            className="paper mb-6 rounded-lg border-2 border-crust bg-apricot p-4 text-sm font-semibold"
          >
            {error || planningError(mutation.error)}
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
            {collecting &&
            !party.data.isHost &&
            days.data?.hostReady !== true &&
            !readiness?.legacyReady ? (
              <PartyPlanningActions party={party.data} workflow={workflow} busy={busy} />
            ) : (v3 && (showWizard || !collecting)) || (previewV3 && collecting) ? (
              <PlanningV3Experience
                key={party.data.selfId}
                party={party.data}
                state={state.data}
                busy={busy || state.isError}
                submit={async (command) => !!(await submit(command))}
                startInPreferences={v3 && !!step}
                onPreferencesSaved={
                  v3
                    ? () => {
                        toast.success("You're ready! Your answers are saved privately.");
                        finish();
                      }
                    : undefined
                }
                onExitPreview={v3 ? undefined : () => setPreviewV3(false)}
              />
            ) : showWizard && !backendSupportsV3(state.data) ? (
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
                  workflow={workflow}
                  {...(step ? { step } : {})}
                  goToStep={goToStep}
                  exit={exit}
                  finish={finish}
                />
              </>
            ) : collecting ? (
              <section className="paper mx-auto max-w-md rounded-2xl border-2 border-crust bg-offwhite p-6 shadow-pop">
                <h1 className="text-2xl font-extrabold">Your shared hangout</h1>
                <PartyPlanningActions party={party.data} workflow={workflow} busy={busy} />
              </section>
            ) : !backendSupportsV3(state.data) ? (
              <PlanningExperience
                key={party.data.selfId}
                party={party.data}
                state={state.data}
                busy={busy || state.isError}
                submit={async (command) => !!(await submit(command))}
              />
            ) : null}
          </>
        )}
      </main>
      {party.data && !party.isError && <div className="mx-auto max-w-6xl px-5 pb-8 sm:px-10"><PartyControls party={party.data} /></div>}
    </div>
  );
}

type WizardProps = Omit<ComponentProps<typeof PlanWizard>, "days" | "step" | "refresh"> & {
  step?: PlanStep;
  workflow: PartyWorkflow;
};

function SliderWizard({ workflow, ...props }: WizardProps) {
  const { days, refresh } = workflow;
  const first = planStepsFor(props.party.isHost)[0] ?? "budget";
  if (!days.data && workflowReadiness(props.party, workflow).legacyReady)
    return <LegacyPlanWizard {...props} step={props.step ?? first} />;
  if (!days.data && days.isError)
    return (
      <section className="mx-auto max-w-md">
        <p role="alert" className="font-bold">
          Couldn't check the hangout's days. Check your connection and try again.
        </p>
        <PopButton tone="sage" className="mt-4" onClick={() => void refresh()}>
          Check again
        </PopButton>
      </section>
    );
  if (!days.data) return <p role="status">Opening your event?</p>;
  return <PlanWizard {...props} step={props.step ?? first} days={days.data} refresh={refresh} />;
}
