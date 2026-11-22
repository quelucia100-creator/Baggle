import { useEffect, useState } from "react";
import { CalendarDays, Clock, Navigation, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import type { PartyState } from "@/lib/party";
import type { PlanningState } from "@/lib/planning/types";
import { dayParts, montrealNowMinutes, montrealToday } from "@/lib/planning/tz";
import {
  draftStorageKey,
  readStored,
  runPlanning,
  vibeStorageKey,
  writeStored,
} from "@/lib/planning-client";
import {
  budgetLevelToSpend,
  dateToPlanDay,
  draftToPreferences,
  emptyPlanDraft,
  firstIncompletePlanStep,
  hhmmToTimeIndex,
  isPlanStepComplete,
  isVibe,
  maxStartIndex,
  minGapSteps,
  planDayToDate,
  planStepsFor,
  SPEND_MAX,
  SPEND_STEP,
  spendLabel,
  spendNote,
  timeIndexLabel,
  timeIndexToHHMM,
  timeMarks,
  timeWindow,
  TRAVEL_MAX,
  TRAVEL_MIN,
  TRAVEL_STEP,
  eventDayWindow,
  vibeOptions,
  type DayTime,
  type PlanDay,
  type PlanDraft,
  type PlanStep as Step,
} from "@/lib/planning/wizard";
import { DayStep, type DayChoice } from "./DayStep";
import { DayTimesStep } from "./DayTimesStep";
import { ChoiceCard, PlanStep } from "./PlanStep";
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
  dayTimes: z
    .record(
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      z.object({
        works: z.boolean(),
        from: z.number().int().min(0).max(48),
        to: z.number().int().min(0).max(48),
      }),
    )
    .default({}),
  vibe: z.string().nullable(),
});

function initialDraft(
  code: string,
  state: PlanningState,
  isHost: boolean,
  today: string,
): PlanDraft {
  const storedVibe = readStored("local", vibeStorageKey(code));
  const vibe = isVibe(storedVibe) ? storedVibe : null;
  let raw: unknown = null;
  try {
    raw = JSON.parse(readStored("session", draftStorageKey(code)) ?? "null");
  } catch {
    raw = null;
  }
  const stored = storedDraftSchema.safeParse(raw);
  if (stored.success)
    return { ...stored.data, vibe: isVibe(stored.data.vibe) ? stored.data.vibe : vibe };
  // A host who already set a later day keeps it; "today" must be chosen deliberately.
  const configuredDay = dateToPlanDay(state.config.date, today);
  const saved = state.selfPreferences;
  const day = isHost && (saved || configuredDay !== "today") ? configuredDay : null;
  const pickedDays = day && day !== "today" ? [day] : [];
  if (!saved) return { ...emptyPlanDraft, day, pickedDays, vibe };
  return {
    spend: budgetLevelToSpend(saved.budget),
    day,
    pickedDays,
    freeFrom: saved.freeFrom,
    freeTo: saved.freeTo,
    travelMin: saved.maxTravelMin,
    dayTimes: {},
    vibe,
  };
}

type Props = {
  code: string;
  party: PartyState;
  state: PlanningState;
  step: Step;
  goToStep: (step: Step, replace?: boolean) => void;
  exit: () => void;
  finish: () => void;
};

export function PlanWizard({ code, party, state, step, goToStep, exit, finish }: Props) {
  const [today] = useState(montrealToday);
  const [nowMin] = useState(montrealNowMinutes);
  const [draft, setDraft] = useState<PlanDraft>(() =>
    initialDraft(code, state, party.isHost, today),
  );
  const [isSaving, setIsSaving] = useState(false);
  const steps = planStepsFor(party.isHost);
  const index = Math.max(0, steps.indexOf(step));
  const activeDay: PlanDay = party.isHost
    ? (draft.day ?? "today")
    : dateToPlanDay(state.config.date, today);
  const slot = timeWindow(activeDay, nowMin);
  const gap = minGapSteps(state.config.durationMin);
  const startCap = maxStartIndex(slot.baseMin, gap, slot.steps);

  // Deep links to a later step (or one this role doesn't have) land on the first unanswered one.
  useEffect(() => {
    const first = firstIncompletePlanStep(draft, steps);
    if (!steps.includes(step)) goToStep(first ?? steps[0] ?? "budget", true);
    else if (first && steps.indexOf(first) < index) goToStep(first, true);
  }, [draft, index, step, steps, goToStep]);
  useEffect(() => {
    writeStored("session", draftStorageKey(code), JSON.stringify(draft));
  }, [code, draft]);

  const savedFrom =
    draft.freeFrom === null ? null : hhmmToTimeIndex(slot.baseMin, draft.freeFrom, slot.steps);
  const savedTo =
    draft.freeTo === null ? null : hhmmToTimeIndex(slot.baseMin, draft.freeTo, slot.steps);
  const fromIdx = Math.min(savedFrom ?? 0, startCap);
  const toIdx = Math.min(slot.steps, Math.max(savedTo ?? slot.steps, fromIdx + gap));
  const travelMin = draft.travelMin ?? DEFAULT_TRAVEL_MIN;
  // Another day (not today): every day the host picked, each with its own vertical slider.
  const eventDate = activeDay === "today" ? null : activeDay;
  const candidateDays =
    eventDate === null
      ? []
      : party.isHost && draft.pickedDays.length
        ? draft.pickedDays
        : [eventDate];
  const eventWindow = eventDate === null ? null : eventDayWindow(draft.dayTimes, eventDate);
  const spend = draft.spend ?? DEFAULT_SPEND;
  const self = party.members.find((member) => member.id === party.selfId);
  const origin = self?.location ? { lat: self.location.lat, lng: self.location.lng } : null;
  const dayName = eventDate === null ? null : dayParts(eventDate).long;

  const setTime = ([from = 0, to = slot.steps]: number[]) =>
    setDraft((current) => ({
      ...current,
      freeFrom: timeIndexToHHMM(slot.baseMin, Math.min(from, startCap)),
      freeTo: timeIndexToHHMM(slot.baseMin, to),
    }));
  // A new day has a different slider window, so earlier times no longer apply.
  const setDay = ({ day, pickedDays }: DayChoice) =>
    setDraft((current) =>
      current.day === day
        ? { ...current, pickedDays }
        : { ...current, day, pickedDays, freeFrom: null, freeTo: null },
    );
  // Untouched sliders still count as an answer: commit what's on screen.
  const committed: PlanDraft =
    step === "budget"
      ? { ...draft, spend }
      : step === "time"
        ? eventDate === null
          ? {
              ...draft,
              freeFrom: timeIndexToHHMM(slot.baseMin, fromIdx),
              freeTo: timeIndexToHHMM(slot.baseMin, toIdx),
            }
          : {
              ...draft,
              freeFrom: eventWindow?.freeFrom ?? null,
              freeTo: eventWindow?.freeTo ?? null,
            }
        : step === "radius"
          ? { ...draft, travelMin }
          : draft;

  const save = async (final: PlanDraft) => {
    setIsSaving(true);
    try {
      const date = planDayToDate(final.day ?? "today", today);
      if (party.isHost && date !== state.config.date)
        await runPlanning(code, { action: "configure", config: { ...state.config, date } });
      await runPlanning(code, { action: "save", preferences: draftToPreferences(final, origin) });
      writeStored("session", draftStorageKey(code), null);
      toast.success("You're ready! Your answers are saved privately.");
      finish();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't save your answers. They're kept here; try again.",
      );
    } finally {
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
      hint: "Go today, or pick a day and everyone shares when they're free.",
    },
    time: {
      icon: Clock,
      title: "When are you free?",
      hint:
        eventDate === null
          ? "Drag the left end for when you're free from and the right end for when you're free until. Montreal time."
          : "Pick the days that work for you and when you're free on each.",
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
      canNext={isPlanStepComplete(step, committed)}
      isBusy={isSaving}
      backLabel={index === 0 ? "Back to map" : "Back"}
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
        <DayStep day={draft.day} pickedDays={draft.pickedDays} today={today} onChange={setDay} />
      )}
      {step === "time" && eventDate !== null && (
        <div className="space-y-3">
          <DayTimesStep
            days={candidateDays}
            value={draft.dayTimes}
            gap={gap}
            onChange={(dayTimes: Record<string, DayTime>) =>
              setDraft((current) => ({ ...current, dayTimes }))
            }
          />
          {!eventWindow && dayName && (
            <p role="status" className="text-xs font-bold">
              For now plans are made for {dayName}, so keep it ticked. Voting between days is coming
              soon.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            The hangout is {state.config.durationMin} minutes, so each window is at least that long.
          </p>
        </div>
      )}
      {step === "time" && eventDate === null && (
        <div className="space-y-4">
          <RangeSlider
            value={[fromIdx, toIdx]}
            onValueChange={setTime}
            min={0}
            max={slot.steps}
            minStepsBetweenThumbs={gap}
            thumbLabels={["Free from", "Free until"]}
            valueText={(_, value) => timeIndexLabel(slot.baseMin, value, slot.isToday)}
            marks={timeMarks(slot)}
          />
          <div className="flex items-center justify-between gap-3 font-bold" aria-live="polite">
            <span>{timeIndexLabel(slot.baseMin, fromIdx, slot.isToday)}</span>
            <span aria-hidden="true">→</span>
            <span>{timeIndexLabel(slot.baseMin, toIdx, slot.isToday)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            The hangout is {state.config.durationMin} minutes, so your window is at least that long.
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
                writeStored("local", vibeStorageKey(code), option.value);
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
