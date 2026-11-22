import { useId, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { BusyGrid } from "./BusyGrid";
import { dayHasFreeTime, type DayDraft, type MemberDraft } from "./member-model";
import { formatDate, formatInstant, formatLongDate, tonightOptions } from "./time";

/** Today/Tonight: one page with two independent "I don't care" choices. */
export function TonightAvailability({
  draft,
  update,
  now,
}: {
  draft: MemberDraft;
  update: (patch: Partial<MemberDraft>) => void;
  now: number;
}) {
  const id = useId();
  const { departures: options, returns } = useMemo(() => tonightOptions(now), [now]);
  const from = draft.departure?.kind === "at" ? draft.departure.at : null;
  const returnOptions = returns.filter(
    (option) => !from || Date.parse(option.value) > Date.parse(from),
  );
  const savedDeparture = from && !options.some((option) => option.value === from);
  const returnAt = draft.returnBy?.kind === "at" ? draft.returnBy.at : null;
  const savedReturn = returnAt && !returnOptions.some((option) => option.value === returnAt);
  return (
    <div className="space-y-6">
      <fieldset className="min-w-0">
        <legend className="mb-2 text-lg font-extrabold">Free from</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceRadio
            name={`${id}-from`}
            checked={draft.departure?.kind === "anytime"}
            onChange={() => update({ departure: { kind: "anytime" } })}
            title="Anytime from now"
            note="You can leave as soon as a plan starts."
          />
          <ChoiceRadio
            name={`${id}-from`}
            checked={draft.departure?.kind === "at"}
            onChange={() => update({ departure: { kind: "at", at: options[0]?.value ?? "" } })}
            title="From a specific time"
          />
        </div>
        {draft.departure?.kind === "at" && (
          <TimeSelect
            label="I can leave at · Montréal"
            value={from ?? ""}
            options={options}
            stale={savedDeparture ? from : null}
            onChange={(at) => update({ departure: { kind: "at", at } })}
          />
        )}
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-lg font-extrabold">Need to be home by</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceRadio
            name={`${id}-back`}
            checked={draft.returnBy?.kind === "none"}
            onChange={() => update({ returnBy: { kind: "none" } })}
            title="No deadline"
            note="No curfew of your own. Venue hours still apply."
          />
          <ChoiceRadio
            name={`${id}-back`}
            checked={draft.returnBy?.kind === "at"}
            onChange={() =>
              update({ returnBy: { kind: "at", at: returnOptions.at(-1)?.value ?? "" } })
            }
            title="By a specific time"
          />
        </div>
        {draft.returnBy?.kind === "at" && (
          <TimeSelect
            label="Home by · Montréal"
            value={returnAt ?? ""}
            options={returnOptions}
            stale={savedReturn ? returnAt : null}
            onChange={(at) => update({ returnBy: { kind: "at", at } })}
          />
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          This is when you need to be back home — travel there and back is counted, not just the end
          of the activity. Times from midnight to 6 AM are the next day.
        </p>
      </fieldset>
    </div>
  );
}

function ChoiceRadio({
  name,
  checked,
  onChange,
  title,
  note,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  note?: string;
}) {
  return (
    <label
      className={`paper flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border-2 border-crust px-4 py-3 text-sm font-bold focus-within:ring-4 focus-within:ring-vista/50 ${checked ? "bg-chartreuse shadow-pop" : "bg-cream hover:bg-apricot"}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span className="flex-1">
        {title}
        {note && <span className="mt-1 block text-xs font-normal">{note}</span>}
      </span>
      {checked && <Check aria-hidden="true" className="h-5 w-5" />}
    </label>
  );
}

function TimeSelect({
  label,
  value,
  options,
  stale,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  stale: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-3 block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="paper h-12 w-full rounded-2xl border-2 border-crust bg-cream px-4 font-bold focus:outline-none focus:ring-4 focus:ring-vista/40"
      >
        {stale && <option value={stale}>{formatInstant(stale)} (saved)</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Multi-day: one candidate day at a time, each confirmed explicitly. */
export function CalendarAvailability({
  draft,
  update,
  dates,
  now,
}: {
  draft: MemberDraft;
  update: (patch: Partial<MemberDraft>) => void;
  dates: string[];
  now: number;
}) {
  const [active, setActive] = useState<string>(
    () => dates.find((date) => !draft.days[date]?.confirmed) ?? dates[0] ?? "",
  );
  const [history, setHistory] = useState<Record<string, DayDraft[]>>({});
  const index = Math.max(0, dates.indexOf(active));
  const day = draft.days[active] ?? { busy: [], confirmed: false };
  const setDay = (next: DayDraft) => {
    setHistory((current) => ({
      ...current,
      [active]: [...(current[active] ?? []), day].slice(-30),
    }));
    update({ days: { ...draft.days, [active]: next } });
  };
  const undo = () => {
    const stack = history[active] ?? [];
    const previous = stack.at(-1);
    if (!previous) return;
    setHistory({ ...history, [active]: stack.slice(0, -1) });
    update({ days: { ...draft.days, [active]: previous } });
  };
  const confirmedCount = dates.filter((date) => draft.days[date]?.confirmed).length;
  const go = (next: number) =>
    setActive(dates[Math.min(dates.length - 1, Math.max(0, next))] ?? active);
  return (
    <div>
      <p role="status" className="mb-3 text-sm font-bold">
        {confirmedCount} of {dates.length} {dates.length === 1 ? "day" : "days"} confirmed
      </p>
      <div
        role="group"
        aria-label="Candidate days"
        className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-2"
      >
        {dates.map((date) => {
          const entry = draft.days[date];
          const status = !entry?.confirmed
            ? "Not reviewed"
            : dayHasFreeTime(date, entry, now)
              ? "Confirmed"
              : "Busy all day";
          return (
            <button
              key={date}
              type="button"
              aria-current={date === active ? "date" : undefined}
              aria-label={`${formatLongDate(date)}: ${status}`}
              onClick={() => setActive(date)}
              className={`paper min-h-14 shrink-0 rounded-lg border-2 px-3 py-2 text-left text-xs font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-vista/50 ${date === active ? "border-crust bg-tangerine shadow-pop" : entry?.confirmed ? "border-crust bg-sage" : "border-dashed border-crust/60 bg-cream"}`}
            >
              <span className="block whitespace-nowrap">{formatDate(date)}</span>
              <span className="mt-0.5 block font-normal">{status}</span>
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => go(index - 1)}
          aria-label="Previous day"
          className="paper grid h-11 w-11 place-items-center rounded-lg border-2 border-crust bg-cream disabled:opacity-40"
        >
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <h3 className="text-center text-lg font-extrabold">{formatLongDate(active)}</h3>
        <button
          type="button"
          disabled={index === dates.length - 1}
          onClick={() => go(index + 1)}
          aria-label="Next day"
          className="paper grid h-11 w-11 place-items-center rounded-lg border-2 border-crust bg-cream disabled:opacity-40"
        >
          <ChevronRight aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
      <BusyGrid
        key={active}
        date={active}
        now={now}
        value={day}
        onChange={setDay}
        onUndo={undo}
        canUndo={!!history[active]?.length}
      />
      <div className="mt-4">
        {day.confirmed ? (
          <p
            role="status"
            className="paper flex items-center gap-2 rounded-lg border-2 border-crust bg-sage p-3 text-sm font-bold"
          >
            <Check aria-hidden="true" className="h-5 w-5" />
            {formatDate(active)} confirmed. Unpainted times count as free.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDay({ ...day, confirmed: true });
              const nextUnconfirmed = dates.find(
                (date) => date !== active && !draft.days[date]?.confirmed,
              );
              if (nextUnconfirmed) setActive(nextUnconfirmed);
            }}
            className="paper flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-crust bg-tangerine font-display font-extrabold shadow-pop pop-press"
          >
            <Check aria-hidden="true" className="h-4 w-4" />
            Confirm {formatDate(active)}
          </button>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Unconfirmed days are never treated as free. Changing a confirmed day asks you to confirm
          it again.
        </p>
      </div>
    </div>
  );
}
