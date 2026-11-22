import { useState } from "react";
import { ArrowLeft, CalendarDays, Check, Moon, Sparkles } from "lucide-react";
import { PopButton } from "@/components/Field";
import {
  ACCESSIBILITY_LABELS,
  ACCESSIBILITY_TAGS,
  ALCOHOL_LABELS,
  ALCOHOL_POLICIES,
  DIETARY_LABELS,
  DIETARY_TAGS,
  TRAVEL_LABELS,
  TRAVEL_MODES,
  type HostConfigV3,
} from "./contract";
import { DateCalendar } from "./DateCalendar";
import {
  DURATION_CHOICES,
  QUICK_DURATIONS,
  formatDuration,
  hostPayload,
  pickDate,
  rangeLimit,
  selectedDates,
  validateHostDraft,
  type HostDraft,
  type HostErrors,
} from "./host-model";
import { PlacePicker } from "./PlacePicker";
import {
  BackendPendingNotice,
  CheckTile,
  Hint,
  RadioTiles,
  Section,
  ToggleTile,
} from "./primitives";
import { formatDate } from "./time";

export function HostSetupV3({
  draft,
  onDraft,
  today,
  canSave,
  busy,
  save,
  onCancel,
}: {
  draft: HostDraft;
  onDraft: (draft: HostDraft) => void;
  today: string;
  /** False while the server is still V2: drafts are kept but never sent. */
  canSave: boolean;
  busy: boolean;
  save: (config: HostConfigV3) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [errors, setErrors] = useState<HostErrors>({});
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [attempted, setAttempted] = useState(false);
  const update = (patch: Partial<HostDraft>) => {
    const next = { ...draft, ...patch };
    onDraft(next);
    if (attempted) setErrors(validateHostDraft(next, today));
    if (status === "error") setStatus("idle");
  };
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
  const dates = selectedDates(draft, today);
  const usesRange = draft.dateMode === "best_day" || draft.selectionStyle === "range";
  const submit = async () => {
    if (busy || status === "saving") return;
    setAttempted(true);
    const found = validateHostDraft(draft, today);
    setErrors(found);
    if (Object.keys(found).length) {
      const first = document.querySelector<HTMLElement>("[data-host-error='true']");
      first?.scrollIntoView?.({ block: "center" });
      return;
    }
    if (!canSave) return;
    setStatus("saving");
    // One mutation per tap. Success is reported only after the server confirms.
    const confirmed = await save(hostPayload(draft, today));
    setStatus(confirmed ? "idle" : "error");
  };
  const errorCount = Object.keys(errors).length;
  return (
    <form
      aria-label="Set up the hangout"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="min-w-0"
    >
      <button
        type="button"
        onClick={onCancel}
        className="mb-4 flex min-h-11 items-center gap-2 text-sm font-bold underline underline-offset-4"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to the crew
      </button>
      <h2 className="text-3xl font-extrabold">Set up the hangout</h2>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        Everything on one page. These shared settings are visible to the crew; your own budget,
        times and location are asked for separately and stay private.
      </p>
      <fieldset disabled={busy || status === "saving"} className="mt-6 min-w-0">
        <div data-host-error={!!errors.when}>
          <Section index={1} title="When?" error={errors.when}>
            <RadioTiles
              legend="Date mode"
              name="date-mode"
              value={draft.dateMode}
              columns={3}
              onChange={(dateMode) => update({ dateMode, rangeStart: null, rangeEnd: null })}
              options={[
                {
                  value: "today_tonight",
                  title: "Today / Tonight",
                  note: "Starts from now, Montréal time.",
                  icon: <Moon className="h-5 w-5" />,
                },
                {
                  value: "future_dates",
                  title: "Pick future date(s)",
                  note: "One date, several, or a range.",
                  icon: <CalendarDays className="h-5 w-5" />,
                },
                {
                  value: "best_day",
                  title: "Find best day together",
                  note: "You set a range; the app picks the day.",
                  icon: <Sparkles className="h-5 w-5" />,
                },
              ]}
            />
            {draft.dateMode === "future_dates" && (
              <RadioTiles
                legend="How to pick"
                name="selection-style"
                value={draft.selectionStyle}
                columns={3}
                onChange={(selectionStyle) =>
                  update({
                    selectionStyle,
                    pickedDates:
                      selectionStyle === "single"
                        ? draft.pickedDates.slice(0, 1)
                        : draft.pickedDates,
                    rangeStart: null,
                    rangeEnd: null,
                  })
                }
                options={[
                  { value: "single", title: "One date" },
                  { value: "multiple", title: "Several dates" },
                  { value: "range", title: "Date range" },
                ]}
              />
            )}
            {(draft.dateMode === "future_dates" || draft.dateMode === "best_day") && (
              <div>
                <DateCalendar
                  label={usesRange ? "Choose the first and last day" : "Choose dates"}
                  today={today}
                  selected={dates}
                  rangeStart={usesRange ? draft.rangeStart : null}
                  rangeEnd={usesRange ? draft.rangeEnd : null}
                  maxDate={
                    usesRange && draft.rangeStart && !draft.rangeEnd
                      ? rangeLimit(draft.rangeStart, today)
                      : undefined
                  }
                  onPick={(date) => update(pickDate(draft, date))}
                />
                <p role="status" className="mt-3 text-sm font-bold">
                  {usesRange && draft.rangeStart && !draft.rangeEnd
                    ? `Starts ${formatDate(draft.rangeStart)} — now tap the last day (up to 14 days).`
                    : dates.length
                      ? `${dates.length} ${dates.length === 1 ? "day" : "days"} selected${dates.length > 1 ? `: ${formatDate(dates[0]!)} – ${formatDate(dates.at(-1)!)}` : `: ${formatDate(dates[0]!)}`}`
                      : "No dates selected yet."}
                </p>
                {draft.dateMode === "best_day" && (
                  <Hint>
                    Everyone marks busy times on each day in the range, then the app picks the day
                    that works best for the group.
                  </Hint>
                )}
              </div>
            )}
            {draft.dateMode === "today_tonight" && (
              <Hint>
                Only times still ahead of the clock are considered. Each person sets when they're
                free and when they need to be home.
              </Hint>
            )}
          </Section>
        </div>

        <div data-host-error={!!errors.where}>
          <Section index={2} title="Where?" error={errors.where}>
            <RadioTiles
              legend="Meeting area"
              name="area-mode"
              value={draft.areaMode}
              columns={2}
              onChange={(areaMode) => update({ areaMode })}
              options={[
                {
                  value: "host_area",
                  title: "I'll choose the area",
                  note: "Pick a real neighbourhood or use your location.",
                },
                {
                  value: "optimize_for_group",
                  title: "Let the app find a convenient area for everyone",
                  note: "Uses each person's private starting point — never shown to anyone.",
                },
              ]}
            />
            {draft.areaMode === "host_area" && (
              <>
                <PlacePicker
                  legend="Area"
                  value={draft.area ? { source: "manual", ...draft.area } : null}
                  currentLabel="Near the host's location"
                  onChange={(place) =>
                    update({ area: { label: place.label, lat: place.lat, lng: place.lng } })
                  }
                />
                <RadioTiles
                  legend="How strict is the area?"
                  name="area-strict"
                  value={draft.areaStrict ? "strict" : "preference"}
                  columns={2}
                  onChange={(value) => update({ areaStrict: value === "strict" })}
                  options={[
                    {
                      value: "preference",
                      title: "Preferred area",
                      note: "Nearby places outside it can still win.",
                    },
                    {
                      value: "strict",
                      title: "Hard boundary",
                      note: "Only places inside this area.",
                    },
                  ]}
                />
              </>
            )}
          </Section>
        </div>

        <Section
          index={3}
          title="Group rules"
          description="Rules are mandatory for every option and can't be bypassed by anyone's preferences. Unverified venues are left out."
        >
          <CheckTile
            checked={draft.under18Friendly}
            onChange={(under18Friendly) => update({ under18Friendly })}
            title="Under-18 friendly"
            note="Only venues verified to admit minors."
          />
          <RadioTiles
            legend="Alcohol"
            name="alcohol"
            value={draft.alcoholPolicy}
            onChange={(alcoholPolicy) => update({ alcoholPolicy })}
            options={ALCOHOL_POLICIES.map((value) => ({
              value,
              title: ALCOHOL_LABELS[value].title,
              note: ALCOHOL_LABELS[value].note,
            }))}
          />
          <CheckTile
            checked={draft.freeOnly}
            onChange={(freeOnly) => update({ freeOnly })}
            title="Free activities only"
            note="Overrides everyone's budget. Paid places are left out."
          />
          <fieldset className="min-w-0">
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider">
              Required accessibility
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ACCESSIBILITY_TAGS.map((tag) => (
                <ToggleTile
                  key={tag}
                  pressed={draft.requiredAccessibility.includes(tag)}
                  onToggle={() =>
                    update({ requiredAccessibility: toggle(draft.requiredAccessibility, tag) })
                  }
                >
                  {ACCESSIBILITY_LABELS[tag]}
                </ToggleTile>
              ))}
            </div>
            <Hint>
              Each need is checked separately against verified venue details. Members can add their
              own needs privately.
            </Hint>
          </fieldset>
          <fieldset className="min-w-0">
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider">
              Dietary requirements for food stops
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {DIETARY_TAGS.map((tag) => (
                <ToggleTile
                  key={tag}
                  pressed={draft.dietaryHardRequirements.includes(tag)}
                  onToggle={() =>
                    update({ dietaryHardRequirements: toggle(draft.dietaryHardRequirements, tag) })
                  }
                >
                  {DIETARY_LABELS[tag]}
                </ToggleTile>
              ))}
            </div>
          </fieldset>
        </Section>

        <div data-host-error={!!errors.travel}>
          <Section index={4} title="Getting there" error={errors.travel}>
            <RadioTiles
              legend="Travel arrangement"
              name="travel-arrangement"
              value={draft.travelMode}
              columns={2}
              onChange={(travelMode) => update({ travelMode })}
              options={[
                {
                  value: "independent",
                  title: "Everyone travels individually",
                  note: "Each person's own route and limit is checked.",
                },
                {
                  value: "together",
                  title: "We travel together",
                  note: "Meet first, then go as a group.",
                },
              ]}
            />
            {draft.travelMode === "together" && (
              <>
                <PlacePicker
                  legend="Meeting point"
                  value={draft.meetingPoint ? { source: "manual", ...draft.meetingPoint } : null}
                  currentLabel="Near the host's location"
                  onChange={(place) =>
                    update({ meetingPoint: { label: place.label, lat: place.lat, lng: place.lng } })
                  }
                />
                <RadioTiles
                  legend="How the group travels from the meeting point"
                  name="shared-mode"
                  value={draft.sharedMode}
                  columns={4}
                  onChange={(sharedMode) => update({ sharedMode })}
                  options={TRAVEL_MODES.map((value) => ({ value, title: TRAVEL_LABELS[value] }))}
                />
                <Hint>
                  Each person's own journey to the meeting point is still checked against their
                  private travel limit.
                </Hint>
              </>
            )}
          </Section>
        </div>

        <div data-host-error={!!errors.duration}>
          <Section index={5} title="How long?" error={errors.duration}>
            <RadioTiles
              legend="Duration type"
              name="duration-mode"
              value={draft.durationMode}
              columns={2}
              onChange={(durationMode) => update({ durationMode })}
              options={[
                { value: "fixed", title: "Fixed length" },
                {
                  value: "flexible",
                  title: "Flexible",
                  note: "Anything between a shortest and longest length.",
                },
              ]}
            />
            {draft.durationMode === "fixed" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Quick durations">
                  {QUICK_DURATIONS.map((minutes) => (
                    <ToggleTile
                      key={minutes}
                      pressed={draft.fixedMinutes === minutes}
                      onToggle={() => update({ fixedMinutes: minutes })}
                    >
                      {formatDuration(minutes)}
                    </ToggleTile>
                  ))}
                </div>
                <DurationSelect
                  label="Custom length"
                  value={draft.fixedMinutes}
                  onChange={(fixedMinutes) => update({ fixedMinutes })}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <DurationSelect
                  label="Shortest"
                  value={draft.minMinutes}
                  onChange={(minMinutes) => update({ minMinutes })}
                />
                <DurationSelect
                  label="Longest"
                  value={draft.maxMinutes}
                  onChange={(maxMinutes) => update({ maxMinutes })}
                />
              </div>
            )}
          </Section>
        </div>
      </fieldset>

      <div className="paper sticky bottom-0 z-10 -mx-5 mt-4 space-y-3 border-t-2 border-crust/15 bg-offwhite px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-0 sm:px-0">
        {!canSave && <BackendPendingNotice what="Hangout settings" />}
        {errorCount > 0 && (
          <p role="alert" className="text-sm font-bold">
            {errorCount === 1
              ? "1 section needs attention."
              : `${errorCount} sections need attention.`}
          </p>
        )}
        {status === "error" && (
          <p role="alert" className="text-sm font-bold">
            The save wasn't confirmed. Your settings are still here — try again.
          </p>
        )}
        <PopButton
          type="submit"
          disabled={busy || status === "saving" || !canSave}
          className="flex items-center justify-center gap-2"
        >
          <Check aria-hidden="true" className="h-4 w-4" />
          {status === "saving"
            ? "Saving…"
            : canSave
              ? "Save hangout settings"
              : "Saving requires backend update"}
        </PopButton>
        {!canSave && (
          <button
            type="button"
            onClick={() => void submit()}
            className="w-full text-sm font-bold underline underline-offset-4"
          >
            Check my settings
          </button>
        )}
      </div>
    </form>
  );
}

function DurationSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="paper h-12 w-full rounded-2xl border-2 border-crust bg-cream px-4 font-bold focus:outline-none focus:ring-4 focus:ring-vista/40"
      >
        {DURATION_CHOICES.map((minutes) => (
          <option key={minutes} value={minutes}>
            {formatDuration(minutes)}
          </option>
        ))}
      </select>
    </label>
  );
}
