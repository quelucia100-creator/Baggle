import { useRef } from "react";
import { addDays, formatLongDate, horizonDates, weekdayIndex } from "./time";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Shared Montréal date picker for the 15-day horizon (today through today + 14).
 * Days outside the horizon or beyond the range limit are disabled, not hidden.
 */
export function DateCalendar({
  today,
  selected,
  rangeStart,
  rangeEnd,
  maxDate,
  onPick,
  label,
}: {
  today: string;
  selected: string[];
  rangeStart?: string | null | undefined;
  rangeEnd?: string | null | undefined;
  maxDate?: string | undefined;
  onPick: (date: string) => void;
  label: string;
}) {
  const horizon = horizonDates(today);
  const last = maxDate ?? horizon.at(-1)!;
  const lead = weekdayIndex(today);
  const cells: (string | null)[] = [...Array.from({ length: lead }, () => null), ...horizon];
  const chosen = new Set(selected);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const focus = (date: string) => refs.current[date]?.focus();
  return (
    <div>
      <div role="group" aria-label={label} className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((day) => (
          <span key={day} aria-hidden="true" className="text-center text-xs font-bold uppercase">
            {day}
          </span>
        ))}
        {cells.map((date, index) => {
          if (!date) return <span key={`lead-${index}`} aria-hidden="true" />;
          const disabled = date > last;
          const isSelected = chosen.has(date);
          const edge = date === rangeStart || date === rangeEnd;
          return (
            <button
              key={date}
              ref={(node) => {
                refs.current[date] = node;
              }}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`${formatLongDate(date)}${date === today ? ", today" : ""}${isSelected ? ", selected" : ""}${disabled ? ", unavailable" : ""}`}
              onClick={() => onPick(date)}
              onKeyDown={(event) => {
                const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
                if (!step) return;
                event.preventDefault();
                const target = addDays(date, step);
                if (target >= today && target <= horizon.at(-1)!) focus(target);
              }}
              className={`paper relative flex h-12 flex-col items-center justify-center rounded-md border-2 text-sm font-extrabold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-vista/50 disabled:cursor-not-allowed disabled:border-dashed disabled:border-crust/30 disabled:bg-transparent disabled:text-crust/40 ${
                isSelected
                  ? edge
                    ? "border-crust bg-tangerine shadow-pop"
                    : "border-crust bg-chartreuse"
                  : "border-crust/40 bg-cream hover:bg-apricot"
              }`}
            >
              <span>{Number(date.slice(8))}</span>
              {date === today && <span className="text-[10px] font-bold uppercase">Today</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Montréal dates · today through {formatLongDate(horizon.at(-1)!)}. Dashed days can't be
        chosen.
      </p>
    </div>
  );
}
