import { useState } from "react";
import { Check, Clock, MapPin, Wallet } from "lucide-react";
import { Field } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { PaperIcon } from "@/components/PaperIcon";
import type { PlanningConfig, PlanningState } from "@/lib/planning/types";
import { montrealToday, shiftDate } from "@/lib/planning/tz";
import { categories, validateConfig } from "./model";
import {
  areaConfig,
  areas,
  budgetCards,
  originLabel,
  privateDraft,
  privatePayload,
  travelPresets,
  validateHostStep,
  validatePrivateStep,
  type PrivateDraft,
} from "./wizard-model";
import { Choice, WizardFrame, type WizardSubmit } from "./WizardFrame";

const privateQuestions = [
  "When are you free?",
  "What's your budget?",
  "How far are you willing to go?",
  "Where are you starting from?",
  "Ready to join the plan?",
];
const privateDescriptions = [
  "Montreal local time. An end time at or before your start time means the following day.",
  "Pick what feels comfortable. This stays between you and Baggle — not even the host sees it.",
  "Your maximum estimated travel time, in minutes. A little closer or a little further — your call.",
  "Use the meeting area, or choose a rough Montreal neighbourhood. No device location needed.",
  "One last look. Only you can see these answers; your crew will only see that you're ready.",
];

export function PreferencesForm({
  preferences,
  busy,
  submit,
  onSaved,
  onCancel,
  seed,
  onDraft,
}: {
  preferences: PlanningState["selfPreferences"];
  busy: boolean;
  submit: WizardSubmit;
  onSaved?: () => void;
  onCancel?: () => void;
  seed?: PrivateDraft;
  onDraft?: (draft: PrivateDraft) => void;
}) {
  const [draft, setDraft] = useState(() => seed ?? privateDraft(preferences));
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<PrivateDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onDraft?.(next);
    setError("");
  };
  const next = async () => {
    if (busy || saving) return;
    setError("");
    try {
      if (step < 4) {
        validatePrivateStep(draft, step);
        setStep(step + 1);
        return;
      }
      const payload = privatePayload(draft);
      setSaving(true);
      const confirmed = await submit({ action: "save", preferences: payload });
      if (confirmed) onSaved?.();
      else setError("Your save wasn't confirmed. Your answers are still here — please try again.");
    } catch {
      setError(
        step === 4
          ? "Couldn't save your answers. Please try again."
          : step === 0
            ? "Choose both your start and end time."
            : step === 1
              ? "Choose a budget that feels right for you."
              : "Choose a travel limit from 5 to 90 minutes.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <WizardFrame
      step={step}
      total={5}
      label="My private preferences"
      privateAnswers
      title={privateQuestions[step] ?? "Your preferences"}
      description={privateDescriptions[step] ?? ""}
      busy={busy || saving}
      error={error}
      back={() => {
        setError("");
        if (step) setStep(step - 1);
        else onCancel?.();
      }}
      next={() => void next()}
      action={
        step === 4 ? (preferences ? "Update my preferences" : "Save & join the plan") : "Next"
      }
    >
      <fieldset
        disabled={busy || saving}
        className="min-w-0 space-y-4"
        aria-label={privateQuestions[step]}
      >
        {step === 0 && (
          <>
            <PaperIcon tone="sage" className="mb-5 h-12 w-12">
              <Clock className="h-6 w-6" />
            </PaperIcon>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Free from · Montreal"
                type="time"
                required
                value={draft.freeFrom}
                onChange={(e) => update({ freeFrom: e.target.value })}
              />
              <Field
                label="Free until · Montreal"
                type="time"
                required
                value={draft.freeTo}
                onChange={(e) => update({ freeTo: e.target.value })}
              />
            </div>
            {draft.freeFrom && draft.freeTo && draft.freeTo <= draft.freeFrom && (
              <p className="text-sm font-bold">Until {draft.freeTo} the next day.</p>
            )}
          </>
        )}
        {step === 1 && (
          <div className="grid grid-cols-2 gap-4">
            {budgetCards.map((label, index) => (
              <Choice
                key={label}
                selected={draft.budget === index}
                label={`Budget ${label}`}
                onClick={() => update({ budget: index })}
              >
                <Wallet className="h-5 w-5 shrink-0" />
                <span className="text-2xl font-extrabold">{label}</span>
                {draft.budget === index && <Check className="ml-auto shrink-0" />}
              </Choice>
            ))}
          </div>
        )}
        {step === 2 && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {travelPresets.map((minutes) => (
                <Choice
                  key={minutes}
                  label={`${minutes} minutes`}
                  selected={draft.maxTravelMin === String(minutes)}
                  onClick={() => update({ maxTravelMin: String(minutes) })}
                >
                  <span>
                    {minutes}
                    <span className="ml-1 text-xs">min</span>
                  </span>
                </Choice>
              ))}
            </div>
            <Field
              label="Or choose your own · 5–90 minutes"
              type="number"
              min={5}
              max={90}
              step={1}
              value={draft.maxTravelMin}
              onChange={(e) => update({ maxTravelMin: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              Travel is estimated from the group meeting area unless you choose a starting area
              next.
            </p>
          </>
        )}
        {step === 3 && (
          <>
            <Choice
              selected={draft.originLat === null && draft.originLng === null}
              onClick={() => update({ originLat: null, originLng: null })}
            >
              <MapPin />
              <span>
                Use the group meeting area
                <span className="mt-1 block text-xs font-normal">
                  No starting point to share. This is the default.
                </span>
              </span>
            </Choice>
            {draft.originLat !== null &&
              !areas.some((area) => area.label === originLabel(draft)) && (
                <Choice selected onClick={() => {}}>
                  Keep my saved starting area
                </Choice>
              )}
            <div className="grid grid-cols-2 gap-3">
              {areas.map((area) => (
                <Choice
                  key={area.id}
                  selected={originLabel(draft) === area.label}
                  onClick={() => update({ originLat: area.lat, originLng: area.lng })}
                >
                  <span>
                    {area.label}
                    <span className="mt-1 block text-xs font-normal">{area.note}</span>
                  </span>
                </Choice>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              A rough area only, rounded before saving. Private to you.
            </p>
          </>
        )}
        {step === 4 && (
          <dl className="divide-y-2 divide-crust/15 border-y-2 border-crust/15">
            {[
              [
                "Availability",
                `${draft.freeFrom} → ${draft.freeTo}${draft.freeTo <= draft.freeFrom ? " · next day" : ""} · Montreal`,
              ],
              [
                "Budget",
                draft.budget === null
                  ? "Not selected"
                  : (budgetCards[draft.budget] ?? "Not selected"),
              ],
              ["Estimated travel", `${draft.maxTravelMin} minutes maximum`],
              ["Starting area", originLabel(draft)],
            ].map(([label, value], index) => (
              <div key={label} className="flex items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <dt className="text-xs font-bold uppercase text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-bold">{value}</dd>
                </div>
                <Button
                  variant="ghost"
                  aria-label={`Edit ${label}`}
                  className="h-11 shrink-0 underline"
                  onClick={() => {
                    setError("");
                    setStep(index);
                  }}
                >
                  Edit
                </Button>
              </div>
            ))}
          </dl>
        )}
      </fieldset>
    </WizardFrame>
  );
}

const hostQuestions = [
  "When's the hangout?",
  "Where should we meet?",
  "What should we do?",
  "Good to get the crew together?",
];
const hostDescriptions = [
  "Choose a date and how long you'll hang out. Everyone adds their own free times privately.",
  "Choose a Montreal meeting area. We'll look nearby — no coordinates or GPS needed.",
  "Choose the kind of venue to look for. Some categories may not have verified matches yet.",
  "These event details are shared with your crew. Your own preferences stay separate and private.",
];
export function ConfigForm({
  config,
  busy,
  submit,
  onSaved,
  onCancel,
  onDraft,
}: {
  config: PlanningConfig;
  busy: boolean;
  submit: WizardSubmit;
  onSaved?: () => void;
  onCancel?: () => void;
  onDraft?: (draft: PlanningConfig) => void;
}) {
  const [draft, setDraft] = useState(config);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const today = montrealToday();
  const update = (value: PlanningConfig) => {
    setDraft(value);
    onDraft?.(value);
    setError("");
  };
  const next = async () => {
    if (busy || saving) return;
    setError("");
    try {
      if (step < 3) {
        validateHostStep(draft, step);
        setStep(step + 1);
        return;
      }
      const payload = validateConfig(draft);
      setSaving(true);
      if (await submit({ action: "configure", config: payload })) onSaved?.();
      else setError("Your event update wasn't confirmed. Your edits are kept — try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the event. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <WizardFrame
      label="Host event setup"
      step={step}
      total={4}
      title={hostQuestions[step] ?? "Event details"}
      description={hostDescriptions[step] ?? ""}
      busy={busy || saving}
      error={error}
      next={() => void next()}
      back={() => {
        setError("");
        if (step) setStep(step - 1);
        else onCancel?.();
      }}
      action={step === 3 ? "Save event details" : "Next"}
    >
      <fieldset disabled={busy || saving} className="space-y-4" aria-label={hostQuestions[step]}>
        {step === 0 && (
          <>
            <Field
              label="Date · Montreal"
              type="date"
              required
              min={today}
              max={shiftDate(today, 14)}
              value={draft.date}
              onChange={(e) => update({ ...draft, date: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-3">
              {[30, 60, 120].map((min) => (
                <Choice
                  key={min}
                  selected={draft.durationMin === min}
                  onClick={() => update({ ...draft, durationMin: min })}
                >
                  {min} min
                </Choice>
              ))}
            </div>
            <Field
              label="Duration · 30–240 minutes"
              type="number"
              min={30}
              max={240}
              required
              value={draft.durationMin}
              onChange={(e) => update({ ...draft, durationMin: Number(e.target.value) })}
            />
          </>
        )}
        {step === 1 && (
          <>
            <Choice
              selected={
                !areas.some(
                  (area) =>
                    area.label === draft.areaLabel &&
                    area.lat === draft.area.lat &&
                    area.lng === draft.area.lng,
                )
              }
              onClick={() => update({ ...draft, areaLabel: config.areaLabel, area: config.area })}
            >
              Keep current area · {config.areaLabel}
            </Choice>
            <div className="grid grid-cols-2 gap-3">
              {areas.map((area) => (
                <Choice
                  key={area.id}
                  selected={
                    draft.areaLabel === area.label &&
                    draft.area.lat === area.lat &&
                    draft.area.lng === area.lng
                  }
                  onClick={() => update(areaConfig(draft, area.id))}
                >
                  <span>
                    {area.label}
                    <span className="mt-1 block text-xs font-normal">{area.note}</span>
                  </span>
                </Choice>
              ))}
            </div>
          </>
        )}
        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {categories.map((category) => (
              <Choice
                key={category.value}
                selected={draft.category === category.value}
                onClick={() => update({ ...draft, category: category.value })}
              >
                {category.label}
                {draft.category === category.value && <Check className="ml-auto" />}
              </Choice>
            ))}
          </div>
        )}
        {step === 3 && (
          <dl className="divide-y-2 divide-crust/15 border-y-2 border-crust/15">
            {[
              ["Date & duration", `${draft.date} · ${draft.durationMin} min · Montreal`],
              ["Meeting area", draft.areaLabel],
              ["Category", categories.find((category) => category.value === draft.category)?.label],
            ].map(([label, value], index) => (
              <div key={label} className="flex items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <dt className="text-xs font-bold uppercase text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-bold">{value}</dd>
                </div>
                <Button
                  variant="ghost"
                  className="h-11 shrink-0 underline"
                  aria-label={`Edit ${label}`}
                  onClick={() => {
                    setError("");
                    setStep(index);
                  }}
                >
                  Edit
                </Button>
              </div>
            ))}
          </dl>
        )}
      </fieldset>
    </WizardFrame>
  );
}
