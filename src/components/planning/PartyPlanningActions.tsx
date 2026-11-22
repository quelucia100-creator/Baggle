import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PopButton } from "@/components/Field";
import type { PartyState } from "@/lib/party";
import { PlanningLink } from "./PlanningLink";
import { planningError } from "./model";
import { workflowReadiness, type PartyWorkflow } from "./usePartyWorkflow";
import { backendSupportsV3 } from "./v3/contract";

export function PartyPlanningActions({
  party,
  workflow,
  busy = false,
}: {
  party: PartyState;
  workflow: PartyWorkflow;
  busy?: boolean;
}) {
  const { state, days, mutation, submit, refresh } = workflow;
  const navigate = useNavigate();
  const { ready, selfReady, hostReady, legacyReady } = workflowReadiness(party, workflow);
  const code = party.code;
  if (state.isError || (days.isError && !legacyReady && state.data?.status === "collecting")) {
    return (
      <div className="mt-4">
        <p role="alert" className="text-sm font-bold">
          Couldn't check the hangout. Try again.
        </p>
        <PopButton
          tone="sage"
          className="mt-3"
          disabled={state.isFetching || days.isFetching}
          onClick={() => void refresh()}
        >
          Check again
        </PopButton>
      </div>
    );
  }
  if (!state.data || (state.data.status === "collecting" && !days.data && !legacyReady))
    return (
      <p role="status" className="mt-4 text-sm">
        Checking the hangout…
      </p>
    );
  if (state.data.status !== "collecting")
    return (
      <PlanningLink code={code}>
        {state.data.status === "locking" ? "See planning progress" : "See the plan"}
      </PlanningLink>
    );
  if (!party.isHost && !hostReady && !legacyReady)
    return (
      <p role="status" className="mt-4 text-sm font-bold">
        Waiting for the host to finish setup…
      </p>
    );

  const v3 = backendSupportsV3(state.data);
  const openPreferences = (
    <PlanningLink code={code} step={party.isHost ? "day" : "budget"}>
      {party.isHost ? "Set up the hangout" : "Choose preferences"}
    </PlanningLink>
  );
  const canLock = party.isHost && selfReady && ready >= 2 && (hostReady || legacyReady);
  const error = mutation.error;
  return (
    <>
      {!selfReady || (party.isHost && !hostReady && !legacyReady) ? (
        openPreferences
      ) : (
        <Link
          to="/party/$code/plan"
          params={{ code }}
          search={{ step: party.isHost ? "day" : "budget", edit: true }}
          className="mt-3 inline-block text-sm font-bold underline underline-offset-4"
        >
          Edit my answers
        </Link>
      )}
      <p role="status" className="mt-2 text-sm text-muted-foreground">
        {ready} of {party.members.length} ready
      </p>
      {party.isHost && (selfReady || v3) && (
        <>
          <PopButton
            tone="chartreuse"
            className="mt-4"
            disabled={!canLock || busy || mutation.isPending}
            onClick={async () => {
              if (!canLock) return;
              const result = await submit({ action: "lock" });
              if (result && result.status !== "collecting")
                await navigate({ to: "/party/$code/plan", params: { code } });
              else if (result)
                toast.error(
                  "The hangout is still collecting answers. Check who's ready and try again.",
                );
            }}
          >
            {mutation.isPending ? "Finding your shared plan…" : "Make a Plan"}
          </PopButton>
          {error && (
            <p role="alert" className="mt-2 text-sm font-bold">
              {planningError(error)}
            </p>
          )}
        </>
      )}
    </>
  );
}
