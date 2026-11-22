import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ExternalLink, Link2, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { PopButton } from "@/components/Field";
import type { PartyState } from "@/lib/party";
import type { PlanningState } from "@/lib/planning/types";
import { montrealToday } from "@/lib/planning/tz";
import { isVibe, vibeCategory } from "@/lib/planning/wizard";
import {
  planningKey,
  planningQuery,
  readStored,
  runPlanning,
  vibeStorageKey,
} from "@/lib/planning-client";
import { isPlanningDaysUnavailable, planningDaysQuery } from "@/lib/planning-days";
import { formatPlanTime, planningError, type PlanningCommand } from "./model";

const MAX_HANGOUT_NAME = 80;

type Props = {
  code: string;
  party: PartyState;
  isEnabled: boolean;
  isBusy: boolean;
  /** Pins the chosen venue through the existing party "hangout" action (keeps map + weather working). */
  pinHangout: (name: string, coords: { lat: number; lng: number }) => Promise<boolean>;
  clearHangout: () => void;
};

export function HangoutPanel({ code, party, isEnabled, isBusy, pinHangout, clearHangout }: Props) {
  const queryClient = useQueryClient();
  const planning = useQuery({ ...planningQuery(code), enabled: isEnabled });
  const [isWorking, setIsWorking] = useState(false);
  const state = planning.data;
  const days = useQuery({
    ...planningDaysQuery(code),
    enabled: isEnabled && state?.status === "collecting",
  });
  // Until the host has finished their own answers, nobody else can join or answer.
  const hostReady = days.data?.hostReady ?? isPlanningDaysUnavailable(days.error);
  const ready = state?.members.filter((member) => member.submitted).length ?? 0;
  const total = state?.members.length ?? party.members.length;
  const selfReady = !!state?.members.find((member) => member.id === party.selfId)?.submitted;
  const disabled = isBusy || isWorking;

  const run = async (command: PlanningCommand) => {
    const next = await runPlanning(code, command);
    queryClient.setQueryData(planningKey(code), next);
    return next;
  };
  const pin = (plan: NonNullable<PlanningState["plan"]>) =>
    pinHangout(plan.venue.name.slice(0, MAX_HANGOUT_NAME), plan.venue.location);

  const findHangout = async () => {
    if (!state) return;
    setIsWorking(true);
    try {
      const storedVibe = readStored("local", `${vibeStorageKey(code)}`);
      const category = isVibe(storedVibe) ? vibeCategory(storedVibe) : state.config.category;
      // Keep a day the host picked; a date that has already passed becomes today.
      const today = montrealToday();
      const date = state.config.date >= today ? state.config.date : today;
      await run({ action: "configure", config: { ...state.config, date, category } });
      const result = await run({ action: "lock" });
      if (result.status === "locked" && result.plan) await pin(result.plan);
      else if (result.status === "no_plan") toast.error("No time or place works for everyone.");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.includes("preferences are saved")
          ? error.message
          : planningError(error),
      );
      void planning.refetch();
    } finally {
      setIsWorking(false);
    }
  };
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/party/${code}`);
      toast.success("Invite link copied. Anyone with it can join the party.");
    } catch {
      toast.error(`Couldn't copy. Share the party code ${code} instead.`);
    }
  };
  const tryAgain = async () => {
    setIsWorking(true);
    try {
      await run({ action: "reopen" });
    } catch (error) {
      toast.error(planningError(error));
    } finally {
      setIsWorking(false);
    }
  };

  const plan = state?.plan ?? null;
  const showPlan = !!plan && (state?.status === "locked" || state?.status === "final");
  const pinIsStale =
    showPlan &&
    party.isHost &&
    plan &&
    party.hangout?.name !== plan.venue.name.slice(0, MAX_HANGOUT_NAME);
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
          <p className="text-sm text-muted-foreground">{plan.compromise}</p>
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
              disabled={disabled}
              className="mt-3 text-sm"
              onClick={() => void pin(plan)}
            >
              Pin this place on the map
            </PopButton>
          )}
        </div>
      ) : (
        <p className="mt-2 break-words font-bold">{party.hangout?.name ?? "Not decided yet"}</p>
      )}

      {state?.status === "collecting" && (
        <>
          {party.isHost || hostReady ? (
            <Link
              to="/party/$code/plan"
              params={{ code }}
              search={{ step: party.isHost ? "day" : "budget" }}
              className={`paper mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-crust font-display font-extrabold text-crust shadow-pop pop-press ${selfReady ? "bg-sage" : "bg-tangerine"} ${disabled ? "pointer-events-none opacity-50" : ""}`}
            >
              {selfReady ? (
                <>
                  Edit my answers
                  <Check className="h-4 w-4" />
                </>
              ) : (
                <>
                  {party.isHost ? "Set up the hangout" : "Plan the hangout"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Link>
          ) : (
            <p
              role="status"
              className="paper mt-4 rounded-lg border-2 border-dashed border-crust bg-cream p-3 text-sm font-bold"
            >
              Waiting for the host to set up the hangout…
            </p>
          )}
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            {ready} of {total} {total === 1 ? "friend" : "friends"} ready
          </p>
          {hostReady ? (
            <button
              type="button"
              onClick={() => void copyInvite()}
              className="mt-1 inline-flex items-center gap-1 text-sm font-bold underline underline-offset-4"
            >
              <Link2 className="h-4 w-4" />
              Copy invite link
            </button>
          ) : (
            party.isHost && (
              <p className="mt-1 text-xs text-muted-foreground">
                Finish setting up the hangout to invite friends.
              </p>
            )
          )}
          {party.isHost && (
            <>
              <PopButton
                tone="chartreuse"
                disabled={disabled || !selfReady || ready < 2}
                className="mt-4 flex items-center justify-center gap-2 text-sm"
                onClick={() => void findHangout()}
              >
                <Search className="h-4 w-4" />
                {isWorking ? "Finding…" : "Find our hangout"}
              </PopButton>
              {(!selfReady || ready < 2) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Answer the questions yourself, and get at least one friend ready, to unlock this.
                </p>
              )}
            </>
          )}
        </>
      )}
      {state?.status === "locking" && (
        <p role="status" className="mt-3 text-sm font-bold">
          Finding your shared plan…
        </p>
      )}
      {state?.status === "no_plan" && (
        <div className="mt-3">
          <p role="alert" className="text-sm font-bold">
            No time or place works for everyone.
          </p>
          {party.isHost ? (
            <PopButton
              tone="sage"
              disabled={disabled}
              className="mt-3 text-sm"
              onClick={() => void tryAgain()}
            >
              Try again
            </PopButton>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Waiting for the host to try again.</p>
          )}
        </div>
      )}
      {planning.isError && !state && (
        <p role="alert" className="mt-3 text-sm">
          Couldn't load planning. It will retry automatically.
        </p>
      )}
      {party.isHost && party.hangout && (
        <PopButton
          tone="apricot"
          disabled={disabled}
          className="mt-3 text-sm"
          onClick={clearHangout}
        >
          Clear hangout
        </PopButton>
      )}
    </section>
  );
}
