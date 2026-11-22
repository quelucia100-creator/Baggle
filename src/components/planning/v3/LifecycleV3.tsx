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
import type { PlanningState, PublicPlanOption } from "@/lib/planning/types";
import { planningControls } from "../model";
import {
  NO_MATCH_ACTION_LABELS,
  WARNING_LABELS,
  isPlanV3,
  type PlanningCommandV3,
  type PublicPlanV3,
  type VersionedPlanningState,
} from "./contract";
import { buildIcs, downloadIcs } from "./ics";
import { formatInstant } from "./time";
import { formatDuration } from "./host-model";

type Submit = (command: PlanningCommandV3) => Promise<boolean>;
type LifecycleState = Pick<
  VersionedPlanningState,
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
  lockAvailable,
}: {
  party: PartyState;
  state: LifecycleState;
  busy: boolean;
  submit: Submit;
  selfReady: boolean;
  /** False on a legacy party: the host must switch it to the new planner first. */
  lockAvailable: boolean;
}) {
  const ready = state.members.filter((member) => member.submitted).length;
  const waiting = party.members.length - ready;
  const [pending, setPending] = useState(false);
  // The server requires the host's own submission plus at least one more.
  const canLock =
    lockAvailable && party.isHost && state.status === "collecting" && ready >= 2 && selfReady;
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
            {!lockAvailable
              ? "Switch the party to the new planner before finding a plan."
              : !selfReady
                ? "Add your own answers first — the host takes part like everyone else."
                : ready < 2
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

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const checkedOn = (at: string) => dayFormat.format(new Date(at));

function costLine(plan: PublicPlanV3) {
  const cost = plan.venue.cost;
  if (!cost) return "Cost unknown — check with the venue.";
  if (cost.free) return `Free · verified ${checkedOn(cost.checkedAt)}`;
  const range = cost.minCad === cost.maxCad ? `$${cost.minCad}` : `$${cost.minCad}–$${cost.maxCad}`;
  return `Estimated ${range} CAD per person · checked ${checkedOn(cost.checkedAt)}`;
}

/** V3 evidence: each line appears only because the server returned it. */
function V3Facts({ plan }: { plan: PublicPlanV3 }) {
  const { venue } = plan;
  const cost = venue.cost;
  return (
    <>
      <li>
        {costLine(plan)}
        {cost && (
          <>
            {" · "}
            <a
              href={cost.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline"
            >
              price source
            </a>
          </>
        )}
      </li>
      <li>Opening hours checked for this date and time.</li>
      <li>
        {venue.bookingRequired === "yes" ? (
          <>
            Booking required
            {venue.bookingUrl && (
              <>
                {" · "}
                <a
                  href={venue.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold underline"
                >
                  Booking page
                </a>
              </>
            )}{" "}
            — nothing is reserved for you.
          </>
        ) : venue.bookingRequired === "no" ? (
          "No booking needed."
        ) : (
          "Booking need unknown — check before you go."
        )}
      </li>
      {venue.accessibilityVerified && (
        <li>
          The venue publishes some accessibility details. Check the venue source for specifics.
        </li>
      )}
      <li>
        {plan.warnings.includes("route_estimates")
          ? "Travel was checked with a routing provider, but some times are estimates."
          : "Travel times were checked with a routing provider for everyone who was ready."}
      </li>
    </>
  );
}

function LegacyFacts({ plan }: { plan: PublicPlanOption }) {
  return (
    <>
      {/* Price tiers are not dollar amounts; never convert them. */}
      <li>
        {plan.venue.priceTier === null
          ? "Cost unknown — check with the venue."
          : "Cost not verified (map price level only) — check with the venue."}
      </li>
      <li>
        {plan.hoursUnknown
          ? "Opening hours not verified — check with the venue."
          : "Opening hours checked for this time."}
      </li>
    </>
  );
}

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
  const v3 = isPlanV3(plan) ? plan : null;
  const controls = planningControls(state as PlanningState, party.isHost, party.selfId);
  const final = state.status === "final";
  const minutes =
    v3?.durationMinutes ?? Math.round((Date.parse(plan.endAt) - Date.parse(plan.startAt)) / 60_000);
  const address = v3?.venue.address ?? null;
  // Cost and booking unknowns are already stated in the facts list.
  // Cost, booking and route-estimate caveats are already stated in the facts list.
  const warnings = (v3?.warnings ?? []).filter(
    (warning) =>
      warning !== "cost_unknown" && warning !== "booking_unknown" && warning !== "route_estimates",
  );
  // V3 options are currently curated-only (the engine narrows `venue.source` to "curated").
  const sourceLabel = v3
    ? "Baggle curated venue"
    : state.venueSource === "google_places"
      ? "Venue data: Google Maps"
      : state.venueSource === "fallback"
        ? "Baggle Montréal list"
        : "Venue source unavailable";
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
          <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">{sourceLabel}</p>
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
            {v3 ? <V3Facts plan={v3} /> : <LegacyFacts plan={plan as PublicPlanOption} />}
            <li className="flex items-start gap-2">
              <CloudSun aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span>
                {plan.weather
                  ? `Forecast summary for this time: ${Math.round(plan.weather.temperature)}°C · ${plan.weather.precipitation}% chance of precipitation`
                  : "Forecast unavailable for this time."}
                {plan.weather && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Weather data by{" "}
                    <a
                      href="https://open-meteo.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Open-Meteo
                    </a>{" "}
                    (
                    <a
                      href="https://open-meteo.com/en/license"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      CC BY 4.0
                    </a>
                    ), summarised for this time slot.
                  </span>
                )}
              </span>
            </li>
          </ul>
          {warnings.length > 0 && (
            <ul className="mt-4 space-y-1 border-l-4 border-crust bg-apricot p-3 text-sm font-bold">
              {warnings.map((warning) => (
                <li key={warning}>{WARNING_LABELS[warning]}</li>
              ))}
            </ul>
          )}
          {v3 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Sources:{" "}
              {v3.venue.attribution.map((entry, index) => (
                <span key={`${entry.name}-${index}`}>
                  {index > 0 && ", "}
                  {entry.url ? (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {entry.name}
                    </a>
                  ) : (
                    entry.name
                  )}
                </span>
              ))}{" "}
              · checked {checkedOn(v3.venue.sourceTimestamp)}
            </p>
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
                onClick={() => void submit({ action: "finalize", revision: state.revision })}
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
  actions,
}: {
  isHost: boolean;
  busy: boolean;
  submit: Submit;
  /** Server-provided generic suggestions (V3); legacy parties get the same neutral list. */
  actions: readonly string[] | null;
}) {
  const suggestions = (actions ?? Object.keys(NO_MATCH_ACTION_LABELS))
    .map((action) => NO_MATCH_ACTION_LABELS[action])
    .filter((label): label is string => !!label);
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
        {suggestions.map((suggestion) => (
          <li key={suggestion}>{suggestion}</li>
        ))}
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
