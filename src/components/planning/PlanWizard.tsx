import { useEffect, useRef, useState } from "react";
import { CalendarDays, Clock, Navigation, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import type { PartyState } from "@/lib/party";
import type { PlanningState } from "@/lib/planning/types";
import { montrealNowMinutes, montrealToday } from "@/lib/planning/tz";
import { draftStorageKey, readStored, writeStored } from "@/lib/planning-client";
import { runPlanningDays, type PlanningDays } from "@/lib/planning-days";
import {
  budgetLevelToSpend,
  dateToPlanDay,
  draftToPreferences,
  emptyPlanDraft,
  firstIncompletePlanStep,
  isPlanStepComplete,
  isVibe,
  minGapSteps,
  planStepsFor,
  SPEND_MAX,
  SPEND_STEP,
  spendLabel,
  spendNote,
  TRAVEL_MAX,
  TRAVEL_MIN,
  TRAVEL_STEP,
  DAY_SLOTS,
  dayWindowsFor,
  windowsToSlots,
  clampFree,
  STEP_MIN,
  vibeCategory,
  vibeOptions,
  type DayFree,
  type PlanDay,
  type PlanDraft,
  type PlanStep as Step,
} from "@/lib/planning/wizard";
import { DayStep, type DayChoice } from "./DayStep";
import { AvailabilityCalendar } from "./AvailabilityCalendar";
import { ChoiceCard, PlanStep } from "./PlanStep";
import { PopButton } from "@/components/Field";
import { RangeSlider } from "./RangeSlider";

const DEFAULT_TRAVEL_MIN = 30;
const DEFAULT_SPEND = 25;
const spendMarks = ["$0", "$25", "$50", "$75", `$${SPEND_MAX}+`];
const hhmm = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .nullable();
const storedDraftSchema = z.object({
  spend: z.number().int().min(0).max(SPEND_MAX).nullable(),
  day: z
    .string()
    .regex(/^(today|\d{4}-\d{2}-\d{2})$/)
    .nullable(),
  pickedDays: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .max(7)
    .default([]),
  freeFrom: hhmm,
  freeTo: hhmm,
  travelMin: z.number().int().min(TRAVEL_MIN).max(TRAVEL_MAX).nullable(),
  dayFree: z
    .record(
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      z
        .array(
          z
            .number()
            .int()
            .min(0)
            .max(DAY_SLOTS - 1),
        )
        .max(DAY_SLOTS),
    )
    .default({}),
  vibe: z.string().nullable(),
});

/** Saved per-day windows back onto the free-time grid. */
function savedDayFree(days: PlanningDays): Record<string, DayFree> {
  const saved = days.selfWindows;
  if (!saved) return {};
  return Object.fromEntries(days.dates.map((date) => [date, windowsToSlots(saved[date] ?? [])]));
}

function initialDraft(
  draftKey: string,
  state: PlanningState,
  isHost: boolean,
  today: string,
  days: PlanningDays,
  revision: number,
): PlanDraft {
  const vibe =
    isHost && state.selfPreferences
      ? (vibeOptions.find((option) => option.category === state.config.category)?.value ?? null)
      : null;
  let raw: unknown = null;
  try {
    raw = JSON.parse(readStored("session", draftKey) ?? "null");
  } catch {
    raw = null;
  }
  const stored = storedDraftSchema.extend({ revision: z.number() }).safeParse(raw);
  if (stored.success && stored.data.revision === revision)
    return { ...stored.data, vibe: isVibe(stored.data.vibe) ? stored.data.vibe : vibe };
  // A host who already offered days keeps them; "today" must be chosen deliberately.
  const offered = days.dates.filter((date) => date >= today);
  const configuredDay =
    offered.length === 1
      ? dateToPlanDay(offered[0]!, today)
      : (offered[0] ?? dateToPlanDay(state.config.date, today));
  const saved = state.selfPreferences;
  const day = isHost && (saved || configuredDay !== "today") ? configuredDay : null;
  const pickedDays = day && day !== "today" ? (offered.length ? offered : [day]) : [];
  const dayFree = savedDayFree(days);
  if (!saved) return { ...emptyPlanDraft, day, pickedDays, vibe, dayFree };
  return {
    spend: budgetLevelToSpend(saved.budget),
    day,
    pickedDays,
    freeFrom: saved.freeFrom,
    freeTo: saved.freeTo,
    travelMin: saved.maxTravelMin,
    dayFree,
    vibe,
  };
}

type Props = {
  code: string;
  party: PartyState;
  state: PlanningState;
  /** Host-offered days, my own per-day windows, and whether the host has finished. */
  days: PlanningDays;
  step: Step;
  goToStep: (step: Step, replace?: boolean) => void;
  exit: () => void;
  finish: () => void;
  refresh?: () => Promise<unknown>;
};

export function PlanWizard(props: Props) {
  // Nobody else answers until the host has finished every step.
  if (!props.party.isHost && !props.days.hostReady) return <WaitingForHost exit={props.exit} />;
  return <PlanWizardSteps {...props} />;
}

function WaitingForHost({ exit }: { exit: () => void }) {
  return (
    <section className="paper mx-auto max-w-md rounded-2xl border-2 border-crust bg-offwhite p-6 shadow-pop">
      <h1 className="text-2xl font-extrabold">The host is still setting up</h1>
      <p role="status" className="mt-3 text-sm">
        Your host is picking the day and answering their own questions first. You can answer as soon
        as they're done. This page updates by itself.
      </p>
      <PopButton tone="sage" className="mt-6" onClick={exit}>
        Back to party
      </PopButton>
    </section>
  );
}

function PlanWizardSteps({
  code,
  party,
  state,
  days,
  step,
  goToStep,
  exit,
  finish,
  refresh,
}: Props) {
  const [today] = useState(montrealToday);
  const [nowMin] = useState(montrealNowMinutes);
  const draftKey = draftStorageKey(code, party.selfId);
  const revision = days.revision ?? state.revision;
  const [draft, setDraft] = useState<PlanDraft>(() =>
    initialDraft(draftKey, state, party.isHost, today, days, revision),
  );
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const draftRevision = useRef(revision);
  const latestRevision = useRef(revision);
  latestRevision.current = revision;
  const steps = planStepsFor(party.isHost);
  const index = Math.max(0, steps.indexOf(step));
  // Previous single-date parties may have no candidate array.
  const offeredDays = days.dates.length ? days.dates : [state.config.date];
  const activeDay: PlanDay = party.isHost
    ? (draft.day ?? "today")
    : (offeredDays[0] ?? dateToPlanDay(state.config.date, today));
  const gap = minGapSteps(state.config.durationMin);
  // Today, half-hours that have already started can't be picked.
  // The current half hour has already started, so today's first pickable slot is the next one.
  const todayMin = Math.ceil(nowMin / STEP_MIN);
  const minSlotFor = (date: string) => (date === today ? todayMin : 0);

  useEffect(() => {
    writeStored("session", draftKey, JSON.stringify({ ...draft, revision: draftRevision.current }));
  }, [draftKey, draft]);

  const travelMin = draft.travelMin ?? DEFAULT_TRAVEL_MIN;
  // Every offered day gets a calendar column; a today-only hangout is one column for today.
  const eventDate = activeDay === "today" ? today : activeDay;
  const candidateDays = party.isHost
    ? draft.day === "today"
      ? [today]
      : draft.pickedDays.length
        ? draft.pickedDays
        : [eventDate]
    : offeredDays;
  const dayFree = { ...draft.dayFree, [today]: clampFree(draft.dayFree[today] ?? [], todayMin) };
  // Only free blocks long enough for the hangout count.
  const dayWindows = dayWindowsFor(dayFree, candidateDays, gap);
  // The single saved window is the first free stretch (the solver uses every per-day stretch).
  const firstWindow = candidateDays.map((date) => dayWindows[date]?.[0]).find(Boolean) ?? null;
  const othersReady = state.members.filter(
    (member) => member.submitted && member.id !== party.selfId,
  ).length;
  const resetsOthers =
    party.isHost && othersReady > 0 && candidateDays.join() !== days.dates.join();
  const spend = draft.spend ?? DEFAULT_SPEND;
  const self = party.members.find((member) => member.id === party.selfId);
  const origin = self?.location ? { lat: self.location.lat, lng: self.location.lng } : null;

  // A new day choice means new columns, so the earlier single window no longer applies.
  const setDay = ({ day, pickedDays }: DayChoice) =>
    setDraft((current) =>
      current.day === day
        ? { ...current, pickedDays }
        : { ...current, day, pickedDays, freeFrom: null, freeTo: null },
    );
  // Deep links to a later step (or one this role doesn't have) land on the first unanswered one.
  useEffect(() => {
    const first = firstIncompletePlanStep(
      { ...draft, freeFrom: firstWindow?.freeFrom ?? null, freeTo: firstWindow?.freeTo ?? null },
      steps,
    );
    if (!steps.includes(step)) goToStep(first ?? steps[0] ?? "budget", true);
    else if (first && steps.indexOf(first) < index) goToStep(first, true);
  }, [draft, firstWindow?.freeFrom, firstWindow?.freeTo, index, step, steps, goToStep]);

  // Untouched sliders still count as an answer: commit what's on screen.
  const committed: PlanDraft =
    step === "budget"
      ? { ...draft, spend }
      : step === "time"
        ? { ...draft, freeFrom: firstWindow?.freeFrom ?? null, freeTo: firstWindow?.freeTo ?? null }
        : step === "radius"
          ? { ...draft, travelMin }
          : draft;

  const save = async (final: PlanDraft) => {
    if (saving.current) return;
    saving.current = true;
    setIsSaving(true);
    try {
      if (!firstWindow) throw new Error("Pick at least one day that works for you.");
      if (draftRevision.current !== latestRevision.current)
        throw new Error("The hangout changed. Review the date and availability and try again.");
      const answers = {
        expectedRevision: draftRevision.current,
        windows: dayWindows,
        preferences: draftToPreferences({ ...final, ...firstWindow }, origin),
      };
      const saved = await runPlanningDays(
        code,
        party.isHost
          ? {
              action: "configure",
              ...answers,
              dates: candidateDays,
              category: final.vibe ? vibeCategory(final.vibe) : state.config.category,
            }
          : { action: "save", ...answers },
      );
      if (!saved.hostReady) throw new Error("Your answers couldn't be confirmed. Try again.");
      writeStored("session", draftKey, null);
      toast.success("You're ready! Your answers are saved privately.");
      finish();
    } catch (error) {
      await refresh?.();
      draftRevision.current = latestRevision.current;
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't save your answers. They're kept here; try again.",
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };
  const next = () => {
    setDraft(committed);
    const following = steps[index + 1];
    if (following) goToStep(following);
    else void save(committed);
  };
  const back = () => {
    const previous = steps[index - 1];
    if (previous) goToStep(previous);
    else exit();
  };

  const meta = {
    budget: {
      icon: Wallet,
      title: "What's your budget?",
      hint: "Per person. Only you see this. Friends just see that you're ready.",
    },
    day: {
      icon: CalendarDays,
      title: "When's the hangout?",
      hint: "Go today, or offer a few days. Your crew can join once you finish these questions.",
    },
    time: {
      icon: Clock,
      title: "When are you free?",
      hint: "Draw a block on each day for every stretch you're free. Leave busy times, like midday, empty. Montreal time.",
    },
    radius: {
      icon: Navigation,
      title: "How far will you go?",
      hint: "Everyone sets their own. We only suggest places that work for the whole crew.",
    },
    vibe: {
      icon: Sparkles,
      title: "What's the vibe?",
      hint: "Pick what you're in the mood for.",
    },
  }[step];
  return (
    <PlanStep
      icon={meta.icon}
      index={index}
      total={steps.length}
      title={meta.title}
      hint={meta.hint}
      isLast={index === steps.length - 1}
      canNext={isPlanStepComplete(step, committed) && (step !== "vibe" || !!firstWindow)}
      isBusy={isSaving}
      backLabel={index === 0 ? "Back to party" : "Back"}
      onBack={back}
      onNext={next}
    >
      {step === "budget" && (
        <div className="space-y-4">
          <p className="text-4xl font-extrabold" aria-live="polite">
            {spend <= 0 ? "$0" : `Up to ${spendLabel(spend)}`}
            <span className="ml-2 text-base font-bold text-muted-foreground">
              {spendNote(spend)}
            </span>
          </p>
          <RangeSlider
            value={[spend]}
            onValueChange={([value = DEFAULT_SPEND]) =>
              setDraft((current) => ({ ...current, spend: value }))
            }
            min={0}
            max={SPEND_MAX}
            step={SPEND_STEP}
            thumbLabels={["Budget per person"]}
            valueText={(_, value) => `${spendLabel(value)} per person, ${spendNote(value)}`}
            marks={spendMarks}
          />
        </div>
      )}
      {step === "day" && (
        <div className="space-y-3">
          <DayStep day={draft.day} pickedDays={draft.pickedDays} today={today} onChange={setDay} />
          {resetsOthers && (
            <p role="status" className="text-xs font-bold">
              Changing the days asks the {othersReady} {othersReady === 1 ? "friend" : "friends"}{" "}
              who already answered to answer again.
            </p>
          )}
        </div>
      )}
      {step === "time" && (
        <div className="space-y-3">
          <AvailabilityCalendar
            days={candidateDays}
            value={dayFree}
            gap={gap}
            minSlotFor={minSlotFor}
            onChange={(next: Record<string, DayFree>) =>
              setDraft((current) => ({ ...current, dayFree: next }))
            }
          />
          <p className="text-xs text-muted-foreground">
            The hangout is {state.config.durationMin} minutes, so a free block needs to be at least
            that long to count.
          </p>
        </div>
      )}
      {step === "radius" && (
        <div className="space-y-4">
          <p className="text-4xl font-extrabold" aria-live="polite">
            Up to {travelMin} min
            <span className="ml-2 text-base font-bold text-muted-foreground">one way</span>
          </p>
          <RangeSlider
            value={[travelMin]}
            onValueChange={([value = DEFAULT_TRAVEL_MIN]) =>
              setDraft((current) => ({ ...current, travelMin: value }))
            }
            min={TRAVEL_MIN}
            max={TRAVEL_MAX}
            step={TRAVEL_STEP}
            thumbLabels={["Longest trip in minutes"]}
            valueText={(_, value) => `${value} minutes one way`}
            marks={[`${TRAVEL_MIN} min`, "30 min", "60 min", `${TRAVEL_MAX} min`]}
          />
          <p className="text-xs text-muted-foreground">
            {origin
              ? "Measured from your shared location, rounded to about 1 km."
              : `Measured from the party's area (${state.config.areaLabel}).`}
          </p>
        </div>
      )}
      {step === "vibe" && (
        <fieldset className="space-y-3">
          <legend className="sr-only">Vibe</legend>
          {vibeOptions.map((option) => (
            <ChoiceCard
              key={option.value}
              name="vibe"
              emoji={option.emoji}
              label={option.label}
              selected={draft.vibe === option.value}
              onSelect={() => {
                setDraft((current) => ({ ...current, vibe: option.value }));
              }}
            />
          ))}
          <p className="pt-1 text-xs text-muted-foreground">
            {draft.vibe === "surprise" ? "We'll roll a random kind of place. " : ""}
            {party.isHost ? "" : "The host's pick sets the type of place for the group."}
          </p>
        </fieldset>
      )}
    </PlanStep>
  );
}
