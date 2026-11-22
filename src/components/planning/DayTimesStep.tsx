import { dayParts } from "@/lib/planning/tz";
import { FULL_DAY, dayTimeLabel, freeAllDay, type DayTime } from "@/lib/planning/wizard";
import { RangeSlider } from "./RangeSlider";

type Props = {
  days: string[];
  value: Readonly<Record<string, DayTime>>;
  /** Shortest window allowed, in slider steps (the hangout's length). */
  gap: number;
  onChange: (next: Record<string, DayTime>) => void;
};

/**
 * Several days on one screen: a vertical 24-hour slider per day (12 AM at the top,
 * midnight at the bottom). Tap a day to say it doesn't work; untouched days count as free.
 */
export function DayTimesStep({ days, value, gap, onChange }: Props) {
  const timeOf = (date: string) => value[date] ?? freeAllDay;
  const set = (date: string, time: DayTime) => onChange({ ...value, [date]: time });
  const working = days.filter((date) => timeOf(date).works);
  return (
    <div>
      <div className="flex justify-center gap-3 overflow-x-auto pb-2">
        {days.map((date) => {
          const parts = dayParts(date);
          const time = timeOf(date);
          return (
            <div key={date} className="flex shrink-0 flex-col items-center gap-2">
              <button
                type="button"
                aria-pressed={time.works}
                aria-label={`${parts.long} works for me`}
                onClick={() => set(date, { ...time, works: !time.works })}
                className={`paper flex w-12 flex-col items-center rounded-md border-2 border-crust py-1.5 font-bold pop-press ${time.works ? "bg-tangerine shadow-pop" : "bg-cream text-muted-foreground"}`}
              >
                <span className="text-[11px] uppercase">{parts.short}</span>
                <span className="text-lg leading-tight">{parts.day}</span>
              </button>
              <div className={time.works ? "" : "opacity-40"}>
                <RangeSlider
                  orientation="vertical"
                  value={[time.from, time.to]}
                  onValueChange={([from = 0, to = FULL_DAY.steps]) =>
                    set(date, { works: true, from, to })
                  }
                  min={0}
                  max={FULL_DAY.steps}
                  minStepsBetweenThumbs={gap}
                  disabled={!time.works}
                  thumbLabels={[`Free from on ${parts.long}`, `Free until on ${parts.long}`]}
                  valueText={(_, index) => dayTimeLabel(index)}
                />
              </div>
              <p
                className="w-14 text-center text-[11px] font-bold leading-tight"
                aria-hidden="true"
              >
                {time.works ? (
                  <>
                    {dayTimeLabel(time.from)}
                    <br />
                    {dayTimeLabel(time.to)}
                  </>
                ) : (
                  "Can't"
                )}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
        {working.length
          ? `Tap a day to say it doesn't work. Drag the top and bottom of each bar for when you're free. Montreal time.`
          : "Pick at least one day that works for you."}
      </p>
    </div>
  );
}
