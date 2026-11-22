import { useState } from "react";
import { dayParts, shiftDate } from "@/lib/planning/tz";
import { PICKABLE_DAYS, togglePickedDay, type PlanDay } from "@/lib/planning/legacy-wizard";
import { ChoiceCard } from "./PlanStep";

export type DayChoice = { day: PlanDay | null; pickedDays: string[] };
type Props = DayChoice & {
  today: string;
  onChange: (choice: DayChoice) => void;
};

/** Host-only: hang out today, or pick one or more days in the coming week. */
export function LegacyDayStep({ day, pickedDays, today, onChange }: Props) {
  const [isPicking, setIsPicking] = useState(
    pickedDays.length > 0 || (day !== null && day !== "today"),
  );
  const upcoming = Array.from({ length: PICKABLE_DAYS }, (_, i) => shiftDate(today, i + 1));
  const pick = (next: string[]) => onChange({ day: next[0] ?? null, pickedDays: next });
  const first = pickedDays[0];
  return (
    <div className="space-y-3">
      <fieldset className="space-y-3">
        <legend className="sr-only">When should the hangout be?</legend>
        <ChoiceCard
          name="day-mode"
          emoji="⚡"
          label="Today"
          note="Everyone slides from now until 12 hours from now"
          selected={!isPicking && day === "today"}
          onSelect={() => {
            setIsPicking(false);
            onChange({ day: "today", pickedDays: [] });
          }}
        />
        <ChoiceCard
          name="day-mode"
          emoji="📅"
          label="Pick days"
          note="Choose one or more days in the next week"
          selected={isPicking}
          onSelect={() => {
            setIsPicking(true);
            pick(pickedDays);
          }}
        />
      </fieldset>
      {isPicking && (
        <div>
          <div
            role="group"
            aria-label="Days for the hangout"
            className="grid grid-cols-7 gap-1.5 pt-2"
          >
            {upcoming.map((date) => {
              const parts = dayParts(date);
              const selected = pickedDays.includes(date);
              return (
                <button
                  key={date}
                  type="button"
                  aria-pressed={selected}
                  aria-label={parts.long}
                  onClick={() => pick(togglePickedDay(pickedDays, date))}
                  className={`paper flex flex-col items-center rounded-md border-2 border-crust py-2 font-bold pop-press ${selected ? "bg-tangerine shadow-pop" : "bg-cream"}`}
                >
                  <span className="text-[11px] uppercase">{parts.short}</span>
                  <span className="text-lg leading-tight">{parts.day}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
            {pickedDays.length > 1 && first
              ? `${pickedDays.length} days picked. Voting between days is coming soon, so for now we'll plan for ${dayParts(first).long}.`
              : "Tap as many days as you like."}
          </p>
        </div>
      )}
    </div>
  );
}
