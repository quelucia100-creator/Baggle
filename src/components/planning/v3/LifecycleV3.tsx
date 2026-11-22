import { useEffect, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  Clock,
  CloudSun,
  ExternalLink,
  Hourglass,
  LockKeyhole,
  MapPin,
  Shuffle,
  Vote,
} from "lucide-react";
import { PopButton } from "@/components/Field";
import { PaperIcon } from "@/components/PaperIcon";
import { PartyInviteQR } from "@/components/PartyInviteQR";
import type { PartyState } from "@/lib/party";
import type { PlanningState } from "@/lib/planning/types";
import { planningControls } from "../model";
import type { PlanningCommandV3, PublicOptionV3Extras } from "./contract";
import { buildIcs, downloadIcs } from "./ics";
import { formatInstant } from "./time";
import { formatDuration } from "./host-model";

type Submit = (command: PlanningCommandV3) => Promise<boolean>;
type LifecycleState = Pick<
  PlanningState,
  | "status"
  | "revision"
  | "members"
  | "plan"
  | "planIndex"
  | "optionCount"
  | "groupRerollsUsed"
  | "votes"
  | "voteThreshold"
  | "selfVoted"
  | "venueSource"
>;

export function PrivacyWelcome() {
  return (
    <div className="paper rounded-lg border-2 border-crust bg-cream p-4 text-sm">
      <p className="flex items-center gap-2 font-extrabold">
        <LockKeyhole aria-hidden="true" className="h-4 w-4" />
        Your answers are private — even from the host
      </p>
      <p className="mt-2 leading-relaxed">
        Your budget, starting location, busy times and any allergy or accessibility needs are only
        used to check options. The crew sees your name and whether you're ready — nothing else.
      </p>
    </div>
  );
}

/** Roster shows names and readiness only. No per-person reasons or "problem person" hints. */
export function CrewRoster({ party, state }: { party: PartyState; state: LifecycleState }) {
  const ready = state.members.filter((member) => member.submitted).length;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold">The crew</h2>
        <span className="text-sm font-bold" aria-live="polite">
          {ready}/{party.members.length} completed
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Crew readiness"
        aria-valuemin={0}
        aria-valuemax={party.members.length}
        aria-valuenow={ready}
        className="mb-4 h-2.5 overflow-hidden rounded-sm bg-crust/15"
      >
        <span
          className="block h-full bg-crust transition-[width] motion-reduce:transition-none"
          style={{ width: `${party.members.length ? (ready / party.members.length) * 100 : 0}%` }}
        />
      </div>
      <ul className="divide-y-2 divide-crust/15 border-y-2 border-crust/15">
        {party.members.map((member) => {
          const submitted =
            state.members.find((entry) => entry.id === member.id)?.submitted === true;
          return (
            <li key={member.id} className="flex items-center gap-3 py-3">
              <PaperIcon tone={submitted ? "sage" : "apricot"} className="h-9 w-9">
                {submitted ? <Check className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
              </PaperIcon>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-bold">
                  {member.name}
                  {member.id === party.selfId ? " (you)" : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {member.host ? "Host · " : ""}
                  {submitted ? "Ready" : "Still answering"}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LobbyActions({
  party,
  state,
  busy,
  submit,
  selfReady,
}: {
  party: PartyState;
  state: LifecycleState;
  busy: boolean;
  submit: Submit;
  selfReady: boolean;
}) {
  const ready = state.members.filter((member) => member.submitted).length;
  const waiting = party.members.length - ready;
  const [pending, setPending] = useState(false);
  const canLock = party.isHost && state.status === "collecting" && ready >= 2;
  return (
    <div className="mt-5 space-y-3">
      {party.isHost && (
        <>
          {party.members.length < 10 && <PartyInviteQR code={party.code} />}
          <PopButton
            disabled={busy || pending || !canLock}
            className="flex items-center justify-center gap-2"
            onClick={async () => {
              setPending(true);
              await submit({ action: "lock" });
              setPending(false);
            }}
          >
            <Check aria-hidden="true" className="h-4 w-4" />
            {pending ? "Starting…" : "Find our plan"}
          </PopButton>
          <p className="text-sm text-muted-foreground">
            {ready < 2
              ? `At least 2 people must be ready (${ready} so far).`
              : waiting > 0
                ? `${waiting} ${waiting === 1 ? "person hasn't" : "people haven't"} finished. If you start now, only the ${ready} ready people are included.`
                : "Everyone is ready."}
          </p>
        </>
      )}
      {!party.isHost && (
        <p role="status" className="text-sm font-bold">
          {selfReady
            ? "You're ready. Waiting for the host to find a plan."
            : "Add your answers to join the plan."}
        </p>
      )}
    </div>
  );
}

export function RevealV3({
  isHost,
  busy,
  submit,
}: {
  isHost: boolean;
  busy: boolean;
  submit: Submit;
}) {
  const [retryReady, setRetryReady] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setRetryReady(true), 30_000);
    return () => window.clearTimeout(timeout);
  }, []);
  return (
    <section
      aria-labelledby="reveal-title"
      className="border-y-2 border-crust/20 py-10 text-center"
    >
      <div className="relative mx-auto mb-6 h-20 w-20">
        <PaperIcon tone="chartreuse" className="h-20 w-20 motion-safe:animate-bounce">
          <Hourglass className="h-9 w-9" />
        </PaperIcon>
      </div>
      <h2 id="reveal-title" className="text-2xl font-extrabold">
        Finding your plan…
      </h2>
      <p role="status" className="mt-3 text-sm">
        Checking times, travel and places for everyone who was ready. Your answers are safe.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">This page updates on its own.</p>
      {isHost && retryReady && (
        <PopButton
          disabled={busy}
          className="mx-auto mt-6 max-w-xs"
          onClick={() => void submit({ action: "lock" })}
        >
          Retry finding a plan
        </PopButton>
      )}
    </section>
  );
}

const costText = (extras: Partial<PublicOptionV3Extras>, priceTier: number | null) => {
  const cost = extras.cost;
  if (cost?.kind === "free") return "Free";
  if (cost?.kind === "estimate")
    return `Estimated $${cost.minCad}${cost.maxCad !== cost.minCad ? `–$${cost.maxCad}` : ""} CAD per person${cost.includesFood === false ? " · food not included" : ""}`;
  // Price tiers are not dollar amounts; never convert them.
  return priceTier === null
    ? "Cost unknown — check with the venue"
    : "Cost not verified (map price level only) — check with the venue";
};

/** One actionable venue card. Claims appear only when the server supplied evidence. */
export function ResultV3({
  party,
  state,
  busy,
  submit,
}: {
  party: PartyState;
  state: LifecycleState;
  busy: boolean;
  submit: Submit;
}) {
  const plan = state.plan;
  const [icsError, setIcsError] = useState("");
  if (!plan) return null;
  const extras = plan as unknown as Partial<PublicOptionV3Extras> & {
    venue: PublicOptionV3Extras["venue"];
  };
  const controls = planningControls(state as PlanningState, party.isHost, party.selfId);
  const final = state.status === "final";
  const minutes =
    extras.durationMinutes ??
    Math.round((Date.parse(plan.endAt) - Date.parse(plan.startAt)) / 60_000);
  const hoursVerified = extras.hoursVerified ?? !plan.hoursUnknown;
  const address = extras.venue?.address ?? null;
  const download = () => {
    try {
      setIcsError("");
      const ics = buildIcs({
        uid: `${party.code}-${state.revision}-${state.planIndex}@baggle`,
        title: `Baggle: ${plan.venue.name}`,
        startAt: plan.startAt,
        endAt: plan.endAt,
        location: address ?? plan.venue.name,
        url: plan.venue.mapsUrl,
        description: "Planned with Baggle. Check opening hours and booking with the venue.",
      });
      downloadIcs(`baggle-${party.code}.ics`, ics);
    } catch {
      setIcsError("Couldn't create the calendar file for this plan.");
    }
  };
  return (
    <section
      aria-label="Shared plan"
      className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
    >
      <div className="paper overflow-hidden rounded-lg border-2 border-crust bg-cream shadow-pop-lg">
        <div className="paper flex items-center justify-between gap-3 border-b-2 border-crust bg-chartreuse px-5 py-4">
          <p className="text-sm font-extrabold">
            {final ? "Final plan" : `Option ${state.planIndex + 1} of ${state.optionCount}`}
          </p>
          <PaperIcon tone="cream" back={null} className="h-8 w-8">
            <MapPin className="h-5 w-5" />
          </PaperIcon>
        </div>
        <div className="p-5 sm:p-7">
          <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">
            {extras.venue?.sourceAttribution ??
              (state.venueSource === "google_places"
                ? "Venue data: Google Maps"
                : state.venueSource === "fallback"
                  ? "Baggle Montréal list"
                  : "Venue source unavailable")}
          </p>
          <h2 className="break-words text-2xl font-extrabold sm:text-3xl">{plan.venue.name}</h2>
          {address && <p className="mt-1 break-words text-sm">{address}</p>}
          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <CalendarDays aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                <strong className="block">{formatInstant(plan.startAt)}</strong>
                until {formatInstant(plan.endAt)} · {formatDuration(minutes)}
                <span className="mt-0.5 block text-xs text-muted-foreground">Montréal time</span>
              </span>
            </li>
            <li>{costText(extras, plan.venue.priceTier)}</li>
            <li>
              {hoursVerified
                ? "Opening hours checked for this time."
                : "Opening hours not verified — check with the venue."}
            </li>
            {extras.bookingRequired === "yes" && (
              <li>
                Booking required
                {extras.bookingUrl && (
                  <>
                    {" · "}
                    <a
                      href={extras.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold underline"
                    >
                      Booking page
                    </a>
                  </>
                )}{" "}
                — availability isn't guaranteed.
              </li>
            )}
            {extras.bookingRequired === "unknown" && (
              <li>Booking need unknown — check before you go.</li>
            )}
            {extras.accessibilityConfidence === "verified" && (
              <li>Accessibility details verified for the group's needs.</li>
            )}
            {extras.travelEstimated && <li>Travel times are estimates, not live routes.</li>}
            <li className="flex items-center gap-2">
              <CloudSun aria-hidden="true" className="h-5 w-5 shrink-0" />
              {plan.weather
                ? `${Math.round(plan.weather.temperature)}°C · ${plan.weather.precipitation}% chance of precipitation`
                : "Forecast unavailable for this time."}
            </li>
          </ul>
          {!!extras.warnings?.length && (
            <ul className="mt-4 space-y-1 border-l-4 border-crust bg-apricot p-3 text-sm font-bold">
              {extras.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {!!extras.reasons?.length && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
              {extras.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <p className="mt-6 border-t-2 border-crust/15 pt-4 text-sm font-bold">
            {plan.compromise}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <a
              href={plan.venue.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="paper flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 border-crust bg-offwhite px-4 font-bold"
            >
              Open in Google Maps
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
            </a>
            {final && (
              <button
                type="button"
                onClick={download}
                className="paper flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 border-crust bg-offwhite px-4 font-bold"
              >
                <CalendarPlus aria-hidden="true" className="h-4 w-4" />
                Add to calendar (.ics)
              </button>
            )}
          </div>
          {icsError && (
            <p role="alert" className="mt-3 text-sm font-bold">
              {icsError}
            </p>
          )}
        </div>
      </div>
      {final ? (
        <p role="status" className="mt-7 flex items-center gap-2 font-bold">
          <Check aria-hidden="true" className="h-5 w-5" />
          Confirmed by the host. See you there.
        </p>
      ) : (
        <div className="mt-8">
          <div aria-live="polite" className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <span className="font-bold">
              {state.votes}/{state.voteThreshold} votes to reroll
            </span>
            <span>{Math.max(0, 3 - state.groupRerollsUsed)} shared rerolls left</span>
            <span>
              {controls.remaining} more {controls.remaining === 1 ? "option" : "options"}
            </span>
          </div>
          <PopButton
            tone="sage"
            disabled={busy || !controls.canVote}
            className="flex items-center justify-center gap-2"
            onClick={() => void submit({ action: "vote", revision: state.revision })}
          >
            <Vote aria-hidden="true" className="h-4 w-4" />
            {state.selfVoted ? "Vote recorded" : "Vote to reroll"}
          </PopButton>
          {!controls.canVote && (
            <p className="mt-3 text-sm text-muted-foreground">
              {state.selfVoted
                ? "Waiting for the rest of the votes."
                : !controls.remaining
                  ? "No more saved options."
                  : state.groupRerollsUsed >= 3
                    ? "The shared rerolls are used up."
                    : "Only people who were ready before the search can vote."}
            </p>
          )}
          {party.isHost && (
            <div className="mt-5 grid grid-cols-2 gap-4">
              <PopButton
                tone="apricot"
                disabled={busy || !controls.canReroll}
                className="flex items-center justify-center gap-2"
                onClick={() => void submit({ action: "host_reroll", revision: state.revision })}
              >
                <Shuffle aria-hidden="true" className="h-4 w-4" />
                Reroll
              </PopButton>
              <PopButton
                disabled={busy || !controls.canFinalize}
                className="flex items-center justify-center gap-2"
                onClick={() => void submit({ action: "finalize" })}
              >
                <Check aria-hidden="true" className="h-4 w-4" />
                Finalize
              </PopButton>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Neutral by design: identical for every private reason and never hints at who blocked it. */
export function NoPlanV3({
  isHost,
  busy,
  submit,
}: {
  isHost: boolean;
  busy: boolean;
  submit: Submit;
}) {
  return (
    <section className="border-y-2 border-crust/20 py-8" aria-labelledby="no-plan-title">
      <PaperIcon tone="apricot" className="mb-6 h-12 w-12">
        <MapPin className="h-6 w-6" />
      </PaperIcon>
      <h2 id="no-plan-title" className="text-2xl font-extrabold">
        No plan fits everyone yet.
      </h2>
      <p className="mt-4">Some ways to open things up:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>Add more days or a wider date range</li>
        <li>Choose a larger or more flexible area</li>
        <li>Try a shorter duration</li>
        <li>Everyone can review their own private answers</li>
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">Saved private answers are kept.</p>
      {isHost ? (
        <PopButton
          tone="sage"
          disabled={busy}
          className="mt-6"
          onClick={() => void submit({ action: "reopen" })}
        >
          Reopen planning
        </PopButton>
      ) : (
        <p role="status" className="mt-6 font-bold">
          Waiting for the host to reopen planning.
        </p>
      )}
    </section>
  );
}
