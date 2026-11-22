import { useEffect, useState } from "react";
import { Clock, Navigation, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import type { PartyState } from "@/lib/party";
import type { PlanningState } from "@/lib/planning/types";
import { montrealNowMinutes } from "@/lib/planning/tz";
import {
  draftStorageKey,
  readStored,
  runPlanning,
  vibeStorageKey,
  writeStored,
} from "@/lib/planning-client";
import {
  budgetOptions,
  draftToPreferences,
  emptyPlanDraft,
  firstIncompletePlanStep,
  hhmmToTimeIndex,
  isPlanStepComplete,
  isVibe,
  kmToTravelMin,
  MAX_KM,
  maxStartIndex,
  MIN_KM,
  minGapSteps,
  planSteps,
  STEP_MIN,
  timeIndexLabel,
  timeIndexToHHMM,
  TIME_STEPS,
  travelMinToKm,
  vibeOptions,
  type PlanDraft,
  type PlanStep as Step,
} from "@/lib/planning/wizard";
import { ChoiceCard, PlanStep } from "./PlanStep";
import { RangeSlider } from "./RangeSlider";

const DEFAULT_KM = 5;
const DEFAULT_BUDGET = 2;
const budgetMarks = budgetOptions.map((option) => option.label);
const TIME_MARK_EVERY = 6;
const storedDraftSchema = z.object({
  budget: z.number().int().min(0).max(4).nullable(),
  freeFrom: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  freeTo: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  km: z.number().int().min(MIN_KM).max(MAX_KM).nullable(),
  vibe: z.string().nullable(),
});

function initialDraft(code: string, saved: PlanningState["selfPreferences"]): PlanDraft {
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
  if (!saved) return { ...emptyPlanDraft, vibe };
  return {
    budget: saved.budget,
    freeFrom: saved.freeFrom,
    freeTo: saved.freeTo,
    km: travelMinToKm(saved.maxTravelMin),
    vibe,
  };
}

const stepMeta = {
  budget: {
    icon: Wallet,
    title: "What's your budget?",
    hint: "Slide to pick. Only you see this. Friends just see that you're ready.",
  },
  time: {
    icon: Clock,
    title: "When are you free?",
    hint: "Drag the left end for when you're free from and the right end for when you're free until. Montreal time.",
  },
  radius: {
    icon: Navigation,
    title: "How far will you go?",
    hint: "We'll only suggest places within your range.",
  },
  vibe: {
    icon: Sparkles,
    title: "What's the vibe?",
    hint: "Pick the kind of place you're in the mood for.",
  },
} as const;

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
  const [draft, setDraft] = useState<PlanDraft>(() => initialDraft(code, state.selfPreferences));
  const [nowMin] = useState(montrealNowMinutes);
  const [isSaving, setIsSaving] = useState(false);
  const index = planSteps.indexOf(step);
  const gap = minGapSteps(state.config.durationMin);
  const startCap = maxStartIndex(nowMin, gap);

  // Deep links to a later step land on the first unanswered one instead.
  useEffect(() => {
    const first = firstIncompletePlanStep(draft);
    if (first && planSteps.indexOf(first) < index) goToStep(first, true);
  }, [draft, index, goToStep]);
  useEffect(() => {
    writeStored("session", draftStorageKey(code), JSON.stringify(draft));
  }, [code, draft]);

  const savedFrom = draft.freeFrom === null ? null : hhmmToTimeIndex(nowMin, draft.freeFrom);
  const savedTo = draft.freeTo === null ? null : hhmmToTimeIndex(nowMin, draft.freeTo);
  const fromIdx = Math.min(savedFrom ?? 0, startCap);
  const toIdx = Math.min(TIME_STEPS, Math.max(savedTo ?? TIME_STEPS, fromIdx + gap));
  const km = draft.km ?? DEFAULT_KM;
  const budget = draft.budget ?? DEFAULT_BUDGET;
  const budgetOption = budgetOptions.find((option) => option.value === budget) ?? budgetOptions[0];
  const timeMarks = Array.from({ length: TIME_STEPS / TIME_MARK_EVERY + 1 }, (_, i) =>
    i === 0 ? "Now" : `+${(i * TIME_MARK_EVERY * STEP_MIN) / 60}h`,
  );
  const self = party.members.find((member) => member.id === party.selfId);
  const origin = self?.location ? { lat: self.location.lat, lng: self.location.lng } : null;

  const setTime = ([from = 0, to = TIME_STEPS]: number[]) =>
    setDraft((current) => ({
      ...current,
      freeFrom: timeIndexToHHMM(nowMin, Math.min(from, startCap)),
      freeTo: timeIndexToHHMM(nowMin, to),
    }));
  // Untouched sliders still count as an answer: commit what's on screen.
  const committed: PlanDraft =
    step === "budget"
      ? { ...draft, budget }
      : step === "time"
        ? {
            ...draft,
            freeFrom: timeIndexToHHMM(nowMin, fromIdx),
            freeTo: timeIndexToHHMM(nowMin, toIdx),
          }
        : step === "radius"
          ? { ...draft, km }
          : draft;

  const save = async (final: PlanDraft) => {
    setIsSaving(true);
    try {
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
    const following = planSteps[index + 1];
    if (following) goToStep(following);
    else void save(committed);
  };
  const back = () => {
    const previous = planSteps[index - 1];
    if (previous) goToStep(previous);
    else exit();
  };

  const meta = stepMeta[step];
  return (
    <PlanStep
      icon={meta.icon}
      index={index}
      total={planSteps.length}
      title={meta.title}
      hint={meta.hint}
      isLast={index === planSteps.length - 1}
      canNext={isPlanStepComplete(step, committed)}
      isBusy={isSaving}
      backLabel={index === 0 ? "Back to map" : "Back"}
      onBack={back}
      onNext={next}
    >
      {step === "budget" && (
        <div className="space-y-4">
          <RangeSlider
            value={[budget]}
            onValueChange={([value = DEFAULT_BUDGET]) =>
              setDraft((current) => ({ ...current, budget: value }))
            }
            min={0}
            max={budgetOptions.length - 1}
            thumbLabels={["Budget"]}
            valueText={(_, value) => {
              const option = budgetOptions.find((o) => o.value === value);
              return option ? `${option.label}, ${option.note}` : String(value);
            }}
            marks={budgetMarks}
          />
          <p className="text-lg font-bold" aria-live="polite">
            {budgetOption.label} � {budgetOption.note}
          </p>
        </div>
      )}
      {step === "time" && (
        <div className="space-y-4">
          <RangeSlider
            value={[fromIdx, toIdx]}
            onValueChange={setTime}
            min={0}
            max={TIME_STEPS}
            minStepsBetweenThumbs={gap}
            thumbLabels={["Free from", "Free until"]}
            valueText={(_, value) => timeIndexLabel(nowMin, value)}
            marks={timeMarks}
          />
          <div className="flex items-center justify-between gap-3 font-bold" aria-live="polite">
            <span>{timeIndexLabel(nowMin, fromIdx)}</span>
            <span aria-hidden="true">→</span>
            <span>{timeIndexLabel(nowMin, toIdx)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            The hangout is {state.config.durationMin} minutes, so your window is at least that long.
          </p>
        </div>
      )}
      {step === "radius" && (
        <div className="space-y-4">
          <RangeSlider
            value={[km]}
            onValueChange={([value = DEFAULT_KM]) =>
              setDraft((current) => ({ ...current, km: value }))
            }
            min={MIN_KM}
            max={MAX_KM}
            thumbLabels={["Travel radius in kilometres"]}
            valueText={(_, value) => `${value} km`}
            marks={[`${MIN_KM} km`, `${MAX_KM / 2} km`, `${MAX_KM} km`]}
          />
          <p className="text-lg font-bold" aria-live="polite">
            Up to {km} km (~{kmToTravelMin(km)} min)
          </p>
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
              label={option.label}
              selected={draft.vibe === option.value}
              onSelect={() => {
                writeStored("local", vibeStorageKey(code), option.value);
                setDraft((current) => ({ ...current, vibe: option.value }));
              }}
            />
          ))}
          {!party.isHost && (
            <p className="pt-1 text-xs text-muted-foreground">
              The host's pick sets the type of place for the group.
            </p>
          )}
        </fieldset>
      )}
    </PlanStep>
  );
}
