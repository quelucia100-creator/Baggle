import { createFileRoute, Link, useHydrated, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PartyHeader } from "@/components/PartyHeader";
import { PopButton } from "@/components/Field";
import { PlanningExperience } from "@/components/planning/PlanningExperience";
import { planningError, type PlanningCommand } from "@/components/planning/model";
import { PlanningV3Experience } from "@/components/planning/v3/PlanningV3Experience";
import { backendSupportsV3, type PlanningCommandV3 } from "@/components/planning/v3/contract";
import { accessParty, membershipToken } from "@/lib/party";
import { updatePartyPlanning } from "@/lib/planning.functions";

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
  component: PlanningPage,
});

function PlanningPage() {
  const { code } = Route.useParams();
  const hydrated = useHydrated();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const planning = useServerFn(updatePartyPlanning);
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
    queryFn: () => planning({ data: { action: "read", code, token: membershipToken() } }),
    enabled: hydrated && !!party.data && !party.isError,
    refetchInterval: () => (queryClient.isMutating({ mutationKey }) ? false : 3000),
    retry: false,
    gcTime: 0,
  });
  const mutation = useMutation({
    mutationKey,
    gcTime: 0,
    mutationFn: (command: PlanningCommand | PlanningCommandV3) =>
      planning({ data: { ...command, code, token: membershipToken() } }),
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
  // Resolves true only after the server confirms the change.
  const submit = async (command: PlanningCommand | PlanningCommandV3) => {
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
