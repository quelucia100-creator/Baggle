import { ExternalLink, Link2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { PopButton } from "@/components/Field";
import type { PartyState } from "@/lib/party";
import { PartyPlanningActions } from "./PartyPlanningActions";
import { workflowReadiness, type PartyWorkflow } from "./usePartyWorkflow";
import { formatPlanTime } from "./model";

const MAX_HANGOUT_NAME = 80;

type Props = {
  code: string;
  party: PartyState;
  workflow: PartyWorkflow;
  isBusy: boolean;
  /** Pins the chosen venue through the existing party "hangout" action (keeps map + weather working). */
  pinHangout: (name: string, coords: { lat: number; lng: number }) => Promise<boolean>;
  clearHangout: () => void;
};

export function HangoutPanel({ code, party, workflow, isBusy, pinHangout, clearHangout }: Props) {
  const state = workflow.state.data;
  const { hostReady } = workflowReadiness(party, workflow);
  const plan = state?.plan;
  const showPlan = !!plan && (state.status === "locked" || state.status === "final");
  const pinIsStale =
    showPlan && party.isHost && party.hangout?.name !== plan.venue.name.slice(0, MAX_HANGOUT_NAME);
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/party/${code}`);
      toast.success("Invite link copied. Anyone with it can join the party.");
    } catch {
      toast.error(`Couldn't copy. Share the party code ${code} instead.`);
    }
  };
  return (
    <section className="border-b-2 border-crust/15 py-6">
      <h2 className="flex items-center gap-2 text-lg font-extrabold">
        <MapPin className="h-5 w-5" />
        The hangout
      </h2>
      {showPlan && plan ? (
        <div className="mt-3 space-y-2">
          <p className="break-words text-xl font-extrabold">{plan.venue.name}</p>
          <p className="text-sm font-bold">
            {formatPlanTime(plan.startAt)} – {formatPlanTime(plan.endAt)} · Montreal
          </p>
          <p className="text-sm text-muted-foreground">
            {"compromise" in plan ? plan.compromise : null}
          </p>
          <a
            href={plan.venue.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-bold underline underline-offset-4"
          >
            Open in Google Maps
            <ExternalLink className="h-4 w-4" />
          </a>
          {pinIsStale && (
            <PopButton
              tone="chartreuse"
              disabled={isBusy}
              className="mt-3 text-sm"
              onClick={() =>
                void pinHangout(plan.venue.name.slice(0, MAX_HANGOUT_NAME), plan.venue.location)
              }
            >
              Pin this place on the map
            </PopButton>
          )}
        </div>
      ) : (
        <p className="mt-2 break-words font-bold">{party.hangout?.name ?? "Not decided yet"}</p>
      )}

      <PartyPlanningActions party={party} workflow={workflow} busy={isBusy} />
      {hostReady && (
        <button
          type="button"
          onClick={() => void copyInvite()}
          className="mt-3 inline-flex items-center gap-1 text-sm font-bold underline underline-offset-4"
        >
          <Link2 className="h-4 w-4" />
          Copy invite link
        </button>
      )}
      {party.isHost && party.hangout && (
        <PopButton tone="apricot" disabled={isBusy} className="mt-3 text-sm" onClick={clearHangout}>
          Clear hangout
        </PopButton>
      )}
    </section>
  );
}
