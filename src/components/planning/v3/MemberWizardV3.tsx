import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bike, Bus, Car, Footprints, LockKeyhole } from "lucide-react";
import { PopButton } from "@/components/Field";
import {
  ACCESSIBILITY_LABELS,
  ACCESSIBILITY_TAGS,
  ACTIVITIES,
  ACTIVITY_LABELS,
  DIETARY_LABELS,
  DIETARY_TAGS,
  DIETARY_UNVERIFIED_NOTE,
  MAX_EXCLUSIONS,
  EXCLUDABLE_ACTIVITIES,
  TRAVEL_LABELS,
  TRAVEL_MODES,
  VIBES,
  VIBE_LABELS,
  type MemberPreferencesV3,
  type TravelMode,
} from "./contract";
import { CalendarAvailability, TonightAvailability } from "./AvailabilitySteps";
import { BudgetStep } from "./BudgetStep";
import {
  MEMBER_STEPS,
  TRAVEL_PRESETS,
  diningPossible,
  memberPayload,
  validateMemberStep,
  type MemberContext,
  type MemberDraft,
  type MemberStep,
} from "./member-model";
import { PlacePicker, SelectedPlace } from "./PlacePicker";
import {
  BackendPendingNotice,
  CheckTile,
  Hint,
  PrivateNote,
  RadioTiles,
  ToggleTile,
} from "./primitives";
import { daySlots, formatDate, formatInstant, slotsToIntervals } from "./time";

const TITLES: Record<MemberStep, { title: string; description: string }> = {
  vibe: {
    title: "What's the vibe?",
    description: "Pick one or two. Vibes help rank options; they never rule anything out.",
  },
  activities: {
    title: "What sounds fun?",
    description: "Likes nudge the ranking. Hard no's are always respected.",
  },
  budget: {
    title: "What's your budget?",
    description: "Per person, in Canadian dollars. Private — not even the host sees it.",
  },
  availability: {
    title: "When are you free?",
    description: "Montréal time. Only you see your schedule.",
  },
  origin: {
    title: "Where are you starting from?",
    description: "Used only to check your own travel time. Never shown to anyone.",
  },
  travel: {
    title: "How are you getting there?",
    description: "Your limit applies to the trip there and the trip home, each way.",
  },
  review: {
    title: "Ready to join the plan?",
    description: "Only you can see these answers. Your crew sees only that you're ready.",
  },
};
const MODE_ICONS: Record<TravelMode, React.ReactNode> = {
  walk: <Footprints className="h-5 w-5" />,
  transit: <Bus className="h-5 w-5" />,
  drive: <Car className="h-5 w-5" />,
  bike: <Bike className="h-5 w-5" />,
};

export function MemberWizardV3({
  draft,
  onDraft,
  context,
  canSave,
  pendingMessage = "Your answers can't be saved right now. Your draft stays on this screen only.",
  busy,
  hasSaved,
  save,
  onCancel,
  initialStep = 0,
}: {
  draft: MemberDraft;
  onDraft: (draft: MemberDraft) => void;
  context: MemberContext;
  canSave: boolean;
  pendingMessage?: string | undefined;
  busy: boolean;
  hasSaved: boolean;
  save: (preferences: MemberPreferencesV3) => Promise<boolean>;
  onCancel: () => void;
  initialStep?: number;
}) {
  const [step, setStep] = useState(initialStep);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const key: MemberStep = MEMBER_STEPS[step] ?? "review";
  useEffect(() => {
    heading.current?.focus({ preventScroll: false });
  }, [step]);
  const update = (patch: Partial<MemberDraft>) => {
    onDraft({ ...draft, ...patch });
    setError("");
  };
  const next = async () => {
    if (busy || saving) return;
    const problem = validateMemberStep(draft, key, context);
    if (problem) {
      setError(problem);
      return;
    }
    if (key !== "review") {
      setStep(step + 1);
      return;
    }
    if (!canSave) return;
    setSaving(true);
    const confirmed = await save(memberPayload(draft, context));
    setSaving(false);
    // Ready is shown only after the server confirms; otherwise the draft stays put.
    if (!confirmed)
      setError("Your save wasn't confirmed. Your answers are still here — please try again.");
  };
  const back = () => {
    setError("");
    if (step) setStep(step - 1);
    else onCancel();
  };
  const actionLabel =
    key !== "review"
      ? "Next"
      : saving
        ? "Saving…"
        : !canSave
          ? "Can't save yet"
          : hasSaved
            ? "Update my answers"
            : "Save & join the plan";
  return (
    <section aria-label="My private preferences" className="min-w-0">
      <div className="paper sticky top-0 z-10 border-y-2 border-crust/15 bg-offwhite py-4">
        <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold uppercase">
          <span className="flex items-center gap-2">
            <LockKeyhole aria-hidden="true" className="h-4 w-4" />
            Private to you
          </span>
          <span>
            Step {step + 1} / {MEMBER_STEPS.length}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Preferences progress"
          aria-valuemin={1}
          aria-valuemax={MEMBER_STEPS.length}
          aria-valuenow={step + 1}
          className="flex gap-1.5"
        >
          {MEMBER_STEPS.map((entry, index) => (
            <span
              key={entry}
              className={`h-2 flex-1 rounded-sm ${index <= step ? "bg-crust" : "bg-crust/15"}`}
            />
          ))}
        </div>
      </div>
      <div key={step} className="wizard-enter py-7">
        <h2 ref={heading} tabIndex={-1} className="mb-2 text-3xl font-extrabold outline-none">
          {TITLES[key].title}
        </h2>
        <p className="mb-6 max-w-lg text-sm text-muted-foreground">{TITLES[key].description}</p>
        <fieldset disabled={busy || saving} className="min-w-0 space-y-5">
          {key === "vibe" && <VibeStep draft={draft} update={update} />}
          {key === "activities" && <ActivitiesStep draft={draft} update={update} />}
          {key === "budget" && (
            <BudgetStep draft={draft} update={update} freeOnly={context.freeOnly} />
          )}
          {key === "availability" &&
            (context.availabilityMode === "tonight" ? (
              <TonightAvailability draft={draft} update={update} now={context.now} />
            ) : (
              <CalendarAvailability
                draft={draft}
                update={update}
                dates={context.candidateDates}
                now={context.now}
              />
            ))}
          {key === "origin" && <OriginStep draft={draft} update={update} context={context} />}
          {key === "travel" && <TravelStep draft={draft} update={update} context={context} />}
          {key === "review" && (
            <ReviewStep
              draft={draft}
              context={context}
              goTo={(index) => {
                setError("");
                setStep(index);
              }}
            />
          )}
        </fieldset>
        {error && (
          <p role="alert" className="mt-5 border-l-4 border-crust bg-apricot p-3 text-sm font-bold">
            {error}
          </p>
        )}
        {key === "review" && !canSave && (
          <div className="mt-5">
            <BackendPendingNotice title="Not saved yet">{pendingMessage}</BackendPendingNotice>
          </div>
        )}
      </div>
      <div className="paper sticky bottom-0 z-10 grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-t-2 border-crust/15 bg-offwhite py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={busy || saving}
          onClick={back}
          className="paper flex h-12 items-center gap-2 rounded-lg border-2 border-crust bg-offwhite px-4 font-bold disabled:opacity-50"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back
        </button>
        <PopButton
          disabled={busy || saving || (key === "review" && !canSave)}
          onClick={() => void next()}
          className="flex h-auto min-h-12 items-center justify-center gap-2 px-4 py-3"
        >
          {actionLabel}
          <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
        </PopButton>
      </div>
    </section>
  );
}

type StepProps = { draft: MemberDraft; update: (patch: Partial<MemberDraft>) => void };

function VibeStep({ draft, update }: StepProps) {
  const full = draft.vibes.length >= 2;
  return (
    <>
      <div role="group" aria-label="Vibes, choose one or two" className="grid grid-cols-2 gap-3">
        {VIBES.map((vibe) => {
          const pressed = draft.vibes.includes(vibe);
          return (
            <ToggleTile
              key={vibe}
              pressed={pressed}
              disabled={!pressed && full}
              onToggle={() =>
                update({
                  vibes: pressed
                    ? draft.vibes.filter((entry) => entry !== vibe)
                    : [...draft.vibes, vibe],
                })
              }
            >
              {VIBE_LABELS[vibe]}
            </ToggleTile>
          );
        })}
      </div>
      <p role="status" className="text-sm font-bold">
        {draft.vibes.length}/2 chosen{full ? " — deselect one to swap." : ""}
      </p>
      <PrivateNote>Your vibe is private. It only changes how options are ranked.</PrivateNote>
    </>
  );
}

function ActivitiesStep({ draft, update }: StepProps) {
  const toggle = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
  return (
    <>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-lg font-extrabold">I'd enjoy</legend>
        <div className="grid grid-cols-2 gap-3">
          {ACTIVITIES.map((activity) => (
            <ToggleTile
              key={activity}
              pressed={draft.likedActivities.includes(activity)}
              disabled={draft.excludedActivities.includes(activity as never)}
              hint={
                draft.excludedActivities.includes(activity as never)
                  ? "Marked as a hard no"
                  : undefined
              }
              onToggle={() => update({ likedActivities: toggle(draft.likedActivities, activity) })}
            >
              {ACTIVITY_LABELS[activity]}
            </ToggleTile>
          ))}
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-lg font-extrabold">
          Absolutely not <span className="text-sm font-bold">(optional, up to 3)</span>
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {EXCLUDABLE_ACTIVITIES.map((activity) => {
            const pressed = draft.excludedActivities.includes(activity);
            const liked = draft.likedActivities.includes(activity);
            return (
              <ToggleTile
                key={activity}
                label={`Never ${ACTIVITY_LABELS[activity]}`}
                pressed={pressed}
                disabled={!pressed && (liked || draft.excludedActivities.length >= MAX_EXCLUSIONS)}
                hint={liked ? "You liked this" : undefined}
                onToggle={() =>
                  update({ excludedActivities: toggle(draft.excludedActivities, activity) })
                }
              >
                {ACTIVITY_LABELS[activity]}
              </ToggleTile>
            );
          })}
        </div>
        <Hint>Hard no's are strict: an option with any of them is never suggested.</Hint>
      </fieldset>
      {diningPossible(draft) && (
        <fieldset className="min-w-0">
          <legend className="mb-2 text-lg font-extrabold">
            Food needs <span className="text-sm font-bold">(optional)</span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {DIETARY_TAGS.map((tag) => (
              <CheckTile
                key={tag}
                checked={draft.dietary.includes(tag)}
                onChange={() => update({ dietary: toggle(draft.dietary, tag) })}
                title={DIETARY_LABELS[tag]}
              />
            ))}
          </div>
          <PrivateNote>
            Only checked against verified venue information. Never shown to the crew.
          </PrivateNote>
          {draft.dietary.length > 0 && <Hint>{DIETARY_UNVERIFIED_NOTE}</Hint>}
        </fieldset>
      )}
      <fieldset className="min-w-0">
        <legend className="mb-2 text-lg font-extrabold">
          Accessibility needs <span className="text-sm font-bold">(optional)</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACCESSIBILITY_TAGS.map((tag) => (
            <CheckTile
              key={tag}
              checked={draft.accessibility.includes(tag)}
              onChange={() => update({ accessibility: toggle(draft.accessibility, tag) })}
              title={ACCESSIBILITY_LABELS[tag]}
            />
          ))}
        </div>
        <PrivateNote>
          Venues without verified support are left out rather than guessed. Private to you.
        </PrivateNote>
      </fieldset>
      <label className="block">
        <span className="mb-1.5 block text-lg font-extrabold">
          Anything else? <span className="text-sm font-bold">(optional)</span>
        </span>
        <textarea
          value={draft.note}
          maxLength={280}
          rows={3}
          onChange={(event) => update({ note: event.target.value })}
          className="paper w-full rounded-2xl border-2 border-crust bg-cream p-3 text-sm focus:outline-none focus:ring-4 focus:ring-vista/40"
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          {draft.note.length}/280 · Saved as written. A note is never turned into a hard rule — use
          the choices above for anything that must be respected.
        </span>
      </label>
    </>
  );
}

function OriginStep({ draft, update, context }: StepProps & { context: MemberContext }) {
  const days = context.availabilityMode === "calendar" ? context.candidateDates.length : 1;
  return (
    <>
      {context.groupArea && (
        <ToggleTile
          pressed={draft.origin?.source === "group_area"}
          onToggle={() =>
            update({ origin: { source: "group_area", label: context.groupArea!.label } })
          }
          hint="I'll already be near the host's chosen area."
        >
          Start from the group area: {context.groupArea.label}
        </ToggleTile>
      )}
      <PlacePicker
        legend="My starting point"
        value={draft.origin && draft.origin.source !== "group_area" ? draft.origin : null}
        onChange={(place) => update({ origin: place })}
      />
      {draft.origin?.source === "group_area" && context.groupArea && (
        <SelectedPlace place={context.groupArea} />
      )}
      {days > 1 && <Hint>This starting point applies to all {days} days.</Hint>}
      <PrivateNote>
        Not shared with the host or crew. Rounded to about 1 km before saving.
      </PrivateNote>
    </>
  );
}

function TravelStep({ draft, update, context }: StepProps & { context: MemberContext }) {
  return (
    <>
      <RadioTiles
        legend="I'll travel by"
        name="travel-mode"
        value={draft.travelMode}
        columns={4}
        onChange={(travelMode) => update({ travelMode })}
        options={TRAVEL_MODES.map((value) => ({
          value,
          title: TRAVEL_LABELS[value],
          icon: MODE_ICONS[value],
        }))}
      />
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider" id="max-travel-label">
          Longest trip, one way
          {draft.travelMode ? ` by ${TRAVEL_LABELS[draft.travelMode].toLowerCase()}` : ""}
        </p>
        <div
          role="group"
          aria-labelledby="max-travel-label"
          className="grid grid-cols-3 gap-2 sm:grid-cols-6"
        >
          {TRAVEL_PRESETS.map((minutes) => (
            <ToggleTile
              key={minutes}
              pressed={draft.maxOneWayMinutes === minutes}
              onToggle={() => update({ maxOneWayMinutes: minutes })}
            >
              {minutes} min
            </ToggleTile>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="mb-1.5 flex justify-between text-xs font-bold uppercase tracking-wider">
            <span>Fine-tune</span>
            <span>{draft.maxOneWayMinutes} minutes</span>
          </span>
          <input
            type="range"
            min={5}
            max={90}
            step={5}
            value={draft.maxOneWayMinutes}
            aria-valuetext={`${draft.maxOneWayMinutes} minutes one way`}
            onChange={(event) => update({ maxOneWayMinutes: Number(event.target.value) })}
            className="h-11 w-full accent-[var(--tangerine)]"
          />
        </label>
        <Hint>
          Checked for the trip there AND the trip home, each on its own, using real travel times for
          your mode.
        </Hint>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider">
          Going home a different way? (optional)
        </span>
        <select
          value={draft.returnMode ?? ""}
          onChange={(event) =>
            update({ returnMode: (event.target.value || null) as TravelMode | null })
          }
          className="paper h-12 w-full rounded-2xl border-2 border-crust bg-cream px-4 font-bold focus:outline-none focus:ring-4 focus:ring-vista/40"
        >
          <option value="">Same as outbound</option>
          {TRAVEL_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {TRAVEL_LABELS[mode]}
            </option>
          ))}
        </select>
      </label>
      {context.sharedTravel && (
        <div>
          <CheckTile
            checked={draft.alreadyAtSharedMeetingPoint}
            onChange={(alreadyAtSharedMeetingPoint) => update({ alreadyAtSharedMeetingPoint })}
            title="I'll already be at the meeting point"
            note="Otherwise your own trip to the meeting point counts toward your limit, plus the shared trip."
          />
        </div>
      )}
    </>
  );
}

function ReviewStep({
  draft,
  context,
  goTo,
}: {
  draft: MemberDraft;
  context: MemberContext;
  goTo: (step: number) => void;
}) {
  const ceiling = !draft.ceiling
    ? "Not chosen"
    : draft.ceiling.kind === "unlimited"
      ? "No hard limit"
      : `Hard ceiling $${draft.ceiling.cad}`;
  const availability =
    context.availabilityMode === "tonight"
      ? [
          `Free from: ${!draft.departure ? "Not chosen" : draft.departure.kind === "anytime" ? "Anytime from now" : formatInstant(draft.departure.at)}`,
          `Home by: ${!draft.returnBy ? "Not chosen" : draft.returnBy.kind === "none" ? "No deadline" : formatInstant(draft.returnBy.at)}`,
        ]
      : context.candidateDates.map((date) => {
          const day = draft.days[date];
          if (!day?.confirmed) return `${formatDate(date)}: not confirmed`;
          const intervals = slotsToIntervals(daySlots(date), new Set(day.busy));
          return `${formatDate(date)}: ${intervals.length ? `busy ${intervals.map((entry) => `${timeOnly(entry.startAt)}–${timeOnly(entry.endAt)}`).join(", ")}` : "free all day"}`;
        });
  const rows: [string, string[], number][] = [
    ["Vibe", [draft.vibes.map((vibe) => VIBE_LABELS[vibe]).join(", ") || "Not chosen"], 0],
    [
      "Activities",
      [
        `Likes: ${draft.likedActivities.map((entry) => ACTIVITY_LABELS[entry]).join(", ") || "Open to anything"}`,
        `Hard no: ${draft.excludedActivities.map((entry) => ACTIVITY_LABELS[entry]).join(", ") || "None"}`,
        ...(draft.dietary.length
          ? [
              `Food needs: ${draft.dietary.map((tag) => DIETARY_LABELS[tag as keyof typeof DIETARY_LABELS]).join(", ")}`,
            ]
          : []),
        ...(draft.accessibility.length
          ? [
              `Accessibility: ${draft.accessibility.map((tag) => ACCESSIBILITY_LABELS[tag as keyof typeof ACCESSIBILITY_LABELS]).join(", ")}`,
            ]
          : []),
        ...(draft.note.trim() ? [`Note: ${draft.note.trim()}`] : []),
      ],
      1,
    ],
    ["Budget", [`Preferred $${draft.preferredMinCad}–$${draft.preferredMaxCad} CAD`, ceiling], 2],
    ["Availability · Montréal", availability, 3],
    ["Starting point", [draft.origin?.label ?? "Not chosen"], 4],
    [
      "Travel",
      [
        `${draft.travelMode ? TRAVEL_LABELS[draft.travelMode] : "Not chosen"}, up to ${draft.maxOneWayMinutes} min each way`,
        ...(draft.returnMode ? [`Home by ${TRAVEL_LABELS[draft.returnMode].toLowerCase()}`] : []),
        ...(context.sharedTravel && draft.alreadyAtSharedMeetingPoint
          ? ["Already at the meeting point"]
          : []),
      ],
      5,
    ],
  ];
  return (
    <dl className="divide-y-2 divide-crust/15 border-y-2 border-crust/15">
      {rows.map(([label, values, step]) => (
        <div key={label} className="flex items-start justify-between gap-3 py-4">
          <div className="min-w-0">
            <dt className="text-xs font-bold uppercase text-muted-foreground">{label}</dt>
            {values.map((value) => (
              <dd key={value} className="mt-1 break-words text-sm font-bold">
                {value}
              </dd>
            ))}
          </div>
          <button
            type="button"
            aria-label={`Edit ${label}`}
            onClick={() => goTo(step)}
            className="min-h-11 shrink-0 px-2 text-sm font-bold underline underline-offset-4"
          >
            Edit
          </button>
        </div>
      ))}
    </dl>
  );
}

const timeOnly = (at: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montreal",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
