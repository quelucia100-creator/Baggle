import { useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  Clock,
  CloudSun,
  ExternalLink,
  Hourglass,
  MapPin,
  Shuffle,
  Vote,
} from "lucide-react";
import { PopButton } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { PaperIcon } from "@/components/PaperIcon";
import bagel from "@/assets/bagel-single.png.asset.json";
import type { PartyState } from "@/lib/party";
import type { PlanningState } from "@/lib/planning/types";
import {
  categories,
  budgets,
  formatPlanTime,
  planningControls,
  type PlanningCommand,
} from "./model";
import { CollectingInputs } from "./CollectingInputs";
import type { WizardSubmit } from "./WizardFrame";

export function PlanningExperience({
  party,
  state,
  busy,
  submit,
}: {
  party: PartyState;
  state: PlanningState;
  busy: boolean;
  submit: WizardSubmit;
}) {
  const controls = planningControls(state, party.isHost, party.selfId);
  const [lockRetryReady, setLockRetryReady] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [state.status]);
  useEffect(() => {
    setLockRetryReady(false);
    if (state.status !== "locking") return;
    const timeout = window.setTimeout(() => setLockRetryReady(true), 30_000);
    return () => window.clearTimeout(timeout);
  }, [state.status]);
  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">
            {party.isHost ? "You're the host" : "Your crew's event"} · {party.code}
          </p>
          <h1
            className={`font-extrabold ${state.status === "collecting" ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"}`}
          >
            {state.status === "final"
              ? "It's a plan."
              : state.status === "collecting"
                ? "Make a plan."
                : "Make time for the crew."}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {state.status === "collecting"
              ? "A little time. A good crew."
              : "Together, without the group-chat guesswork."}
          </p>
        </div>
        <img src={bagel.url} alt="" className="hidden w-24 rotate-12 sm:block" />
      </div>
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)] lg:gap-12">
        <div className="min-w-0 space-y-8">
          {state.status === "collecting" ? (
            <CollectingInputs party={party} state={state} busy={busy} submit={submit} />
          ) : state.status === "locking" ? (
            <section aria-labelledby="finding-title" className="border-y-2 border-crust/20 py-10">
              <PaperIcon tone="chartreuse" className="mb-6 h-14 w-14">
                <Hourglass className="h-7 w-7 motion-safe:animate-pulse" />
              </PaperIcon>
              <h2 id="finding-title" className="text-2xl font-extrabold">
                Finding your shared plan…
              </h2>
              <p role="status" className="mt-3 text-sm">
                Checking options. Your saved answers are safe.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">This page updates automatically.</p>
              {party.isHost && lockRetryReady && (
                <PopButton
                  disabled={busy}
                  className="mt-6"
                  onClick={() => submit({ action: "lock" })}
                >
                  Retry finding a plan
                </PopButton>
              )}
            </section>
          ) : state.status === "no_plan" ? (
            <section className="border-y-2 border-crust/20 py-8" aria-labelledby="no-plan-title">
              <PaperIcon tone="apricot" className="mb-6 h-12 w-12">
                <MapPin className="h-6 w-6" />
              </PaperIcon>
              <h2 id="no-plan-title" className="text-2xl font-extrabold">
                Let's try another way.
              </h2>
              <p className="mt-4">
                We couldn't find a match this time. Try changing date, time, category or travel
                preferences.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Your saved private answers are preserved.
              </p>
              {controls.canReopen ? (
                <PopButton
                  tone="sage"
                  disabled={busy}
                  className="mt-6"
                  onClick={() => submit({ action: "reopen" })}
                >
                  Reopen planning
                </PopButton>
              ) : (
                <p role="status" className="mt-6 font-bold">
                  Waiting for the host to reopen planning.
                </p>
              )}
            </section>
          ) : state.plan ? (
            <PlanResult state={state} party={party} busy={busy} submit={submit} />
          ) : (
            <p role="status">The selected event isn't available. Checking for updates…</p>
          )}
        </div>
        <aside
          className="min-w-0 border-t-2 border-crust/20 pt-6 lg:border-t-0 lg:pt-0"
          aria-label="Crew readiness"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold">The crew</h2>
            <span className="text-sm font-bold">
              {controls.ready} / {party.members.length} ready
            </span>
          </div>
          <ul className="divide-y-2 divide-crust/15 border-y-2 border-crust/15">
            {party.members.map((member) => {
              const submitted =
                state.members.find((entry) => entry.id === member.id)?.submitted === true;
              return (
                <li key={member.id} className="flex items-center gap-3 py-4">
                  <PaperIcon tone={submitted ? "sage" : "apricot"} className="h-9 w-9">
                    {submitted ? <Check className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                  </PaperIcon>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-bold">
                      {member.name}
                      {member.id === party.selfId ? " (you)" : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {member.host ? "Host · " : ""}
                      {submitted ? "Submitted" : "Not submitted"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          {state.status === "collecting" && (
            <>
              <p className="mt-4 text-sm text-muted-foreground">
                At least two submissions are needed. Only readiness is shared.
              </p>
              {party.isHost ? (
                <PopButton
                  disabled={busy || !controls.canLock}
                  className="mt-5 flex items-center justify-center gap-2"
                  onClick={() => submit({ action: "lock" })}
                >
                  <Check className="h-4 w-4" />
                  {busy ? "Working…" : "Lock & find a plan"}
                </PopButton>
              ) : (
                <p role="status" className="mt-5 text-sm font-bold">
                  {state.selfPreferences
                    ? "You're ready. Waiting for the host to find a plan."
                    : "Add your answers to join the plan."}
                </p>
              )}
            </>
          )}
          {state.status !== "collecting" && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-bold">Event details</h3>
              <EventSummary state={state} />
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function EventSummary({ state }: { state: PlanningState }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      <dt className="text-muted-foreground">Activity</dt>
      <dd className="font-bold">
        {categories.find((item) => item.value === state.config.category)?.label}
      </dd>
      <dt className="text-muted-foreground">Date</dt>
      <dd>{state.config.date} · Montreal</dd>
      <dt className="text-muted-foreground">Duration</dt>
      <dd>{state.config.durationMin} minutes</dd>
      <dt className="text-muted-foreground">Area</dt>
      <dd className="break-words">{state.config.areaLabel}</dd>
    </dl>
  );
}

function PlanResult({
  state,
  party,
  busy,
  submit,
}: {
  state: PlanningState;
  party: PartyState;
  busy: boolean;
  submit: (command: PlanningCommand) => void;
}) {
  const plan = state.plan;
  if (!plan) return null;
  const controls = planningControls(state, party.isHost, party.selfId);
  const final = state.status === "final";
  return (
    <section aria-label="Shared event">
      <div className="paper overflow-hidden rounded-lg border-2 border-crust bg-cream shadow-pop-lg">
        <div className="paper flex items-center justify-between gap-3 border-b-2 border-crust bg-chartreuse px-5 py-4">
          <p className="text-sm font-extrabold">
            {final ? "Final · " : ""}Plan {state.planIndex + 1} of {state.optionCount}
          </p>
          <PaperIcon tone="cream" back={null} className="h-8 w-8">
            <MapPin className="h-5 w-5" />
          </PaperIcon>
        </div>
        <div className="p-5 sm:p-7">
          <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">
            {categories.find((item) => item.value === plan.venue.category)?.label ??
              plan.venue.category}{" "}
            ·{" "}
            {state.venueSource === "google_places"
              ? "Live venues"
              : state.venueSource === "fallback"
                ? "Montreal fallback"
                : "Venue source unavailable"}
          </p>
          <h2 className="break-words text-2xl font-extrabold sm:text-3xl">{plan.venue.name}</h2>
          <div className="mt-6 space-y-3">
            <p className="flex items-start gap-3 text-sm">
              <CalendarDays className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                <strong className="block">{formatPlanTime(plan.startAt)}</strong>until{" "}
                {formatPlanTime(plan.endAt)}
                <span className="mt-1 block text-xs text-muted-foreground">
                  Montreal local time
                </span>
              </span>
            </p>
            <p className="text-sm">
              {plan.venue.priceTier === null
                ? "Price not verified"
                : `Verified price tier: ${budgets[plan.venue.priceTier] ?? plan.venue.priceTier}`}
            </p>
            <p className="text-sm">
              {plan.hoursUnknown
                ? "Opening hours not verified — check with the venue."
                : "Opening hours verified for this option."}
            </p>
            {plan.weather ? (
              <p className="flex items-center gap-2 text-sm">
                <CloudSun className="h-5 w-5 shrink-0" />
                {Math.round(plan.weather.temperature)}°C · {plan.weather.precipitation}% chance of
                precipitation
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Forecast unavailable for this option.</p>
            )}
          </div>
          <p className="mt-6 border-t-2 border-crust/15 pt-4 text-sm font-bold">
            {plan.compromise}
          </p>
          <Button
            asChild
            variant="outline"
            className="mt-5 h-12 w-full border-2 bg-offwhite font-bold"
          >
            <a href={plan.venue.mapsUrl} target="_blank" rel="noopener noreferrer">
              Open in Google Maps
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
      {final ? (
        <p role="status" className="mt-7 flex items-center gap-2 font-bold">
          <Check className="h-5 w-5" />
          Confirmed by the host. See you there.
        </p>
      ) : (
        <div className="mt-8">
          <div aria-live="polite" className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <span className="font-bold">
              {state.votes} / {state.voteThreshold} votes to reroll
            </span>
            <span>{Math.max(0, 3 - state.groupRerollsUsed)} shared rerolls left</span>
            <span>{controls.remaining} options remaining</span>
          </div>
          <PopButton
            tone="sage"
            disabled={busy || !controls.canVote}
            className="flex items-center justify-center gap-2"
            onClick={() => submit({ action: "vote", revision: state.revision })}
          >
            <Vote className="h-4 w-4" />
            {state.selfVoted ? "Vote recorded" : "Vote to reroll"}
          </PopButton>
          {!controls.canVote && (
            <p className="mt-3 text-sm text-muted-foreground">
              {state.selfVoted
                ? "Waiting for the rest of the votes."
                : !controls.remaining
                  ? "This is the last saved option."
                  : state.groupRerollsUsed >= 3
                    ? "The shared reroll allowance is used."
                    : "Only members who submitted before locking can vote."}
            </p>
          )}
          {party.isHost && (
            <div className="mt-5 grid grid-cols-2 gap-4">
              <PopButton
                tone="apricot"
                disabled={busy || !controls.canReroll}
                className="flex items-center justify-center gap-2"
                onClick={() => submit({ action: "host_reroll", revision: state.revision })}
              >
                <Shuffle className="h-4 w-4" />
                Reroll
              </PopButton>
              <PopButton
                disabled={busy || !controls.canFinalize}
                className="flex items-center justify-center gap-2"
                onClick={() => submit({ action: "finalize" })}
              >
                <Check className="h-4 w-4" />
                Finalize
              </PopButton>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
