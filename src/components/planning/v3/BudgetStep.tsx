import { useEffect, useId, useState } from "react";
import {
  BUDGET_MAX,
  BUDGET_PRESETS,
  BUDGET_STEP,
  matchingPreset,
  normalizeBudget,
  type MemberDraft,
} from "./member-model";
import { Hint, PrivateNote, ToggleTile } from "./primitives";

/**
 * Preferred spending band (soft, presets + two bounded sliders) is visually separate from
 * the hard ceiling, which must be explicitly set or explicitly declined.
 */
export function BudgetStep({
  draft,
  update,
  freeOnly,
}: {
  draft: MemberDraft;
  update: (patch: Partial<MemberDraft>) => void;
  freeOnly: boolean;
}) {
  const id = useId();
  const preset = matchingPreset(draft);
  const setMin = (value: number) => {
    const min = normalizeBudget(value);
    update({ preferredMinCad: min, preferredMaxCad: Math.max(min, draft.preferredMaxCad) });
  };
  const setMax = (value: number) => {
    const max = normalizeBudget(value);
    update({ preferredMaxCad: max, preferredMinCad: Math.min(max, draft.preferredMinCad) });
  };
  const capValue = draft.ceiling?.kind === "cap" ? draft.ceiling.cad : "";
  return (
    <>
      {freeOnly && (
        <p className="paper rounded-lg border-2 border-crust bg-sage p-3 text-sm font-bold">
          The host chose free activities only, so paid places are left out whatever you pick.
        </p>
      )}
      <fieldset className="paper min-w-0 rounded-lg border-2 border-crust bg-cream p-4">
        <legend className="px-1 text-lg font-extrabold">Preferred spend</legend>
        <p className="mb-3 text-xs">
          A soft preference. Cheaper and free options are never ruled out.
        </p>
        <div
          role="group"
          aria-label="Budget presets"
          className="grid grid-cols-2 gap-2 sm:grid-cols-5"
        >
          {BUDGET_PRESETS.map((entry) => (
            <ToggleTile
              key={entry.id}
              pressed={preset === entry.id}
              onToggle={() => update({ preferredMinCad: entry.min, preferredMaxCad: entry.max })}
            >
              {entry.label}
            </ToggleTile>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <BoundInput
            id={`${id}-min`}
            label="From"
            value={draft.preferredMinCad}
            onChange={setMin}
          />
          <BoundInput id={`${id}-max`} label="To" value={draft.preferredMaxCad} onChange={setMax} />
        </div>
        <div className="mt-4 space-y-2">
          <RangeInput label="Preferred minimum" value={draft.preferredMinCad} onChange={setMin} />
          <RangeInput label="Preferred maximum" value={draft.preferredMaxCad} onChange={setMax} />
        </div>
        <p role="status" className="mt-3 text-sm font-bold">
          Preferred ${draft.preferredMinCad}–${draft.preferredMaxCad}
          {draft.preferredMaxCad === BUDGET_MAX ? "+" : ""} CAD per person
        </p>
      </fieldset>

      <fieldset className="paper min-w-0 rounded-lg border-2 border-crust bg-offwhite p-4">
        <legend className="px-1 text-lg font-extrabold">Hard spending ceiling</legend>
        <p className="mb-3 text-xs">
          A strict limit. An option above it is never suggested to the group.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label
            className={`paper flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 border-crust px-4 py-3 text-sm font-bold focus-within:ring-4 focus-within:ring-vista/50 ${draft.ceiling?.kind === "cap" ? "bg-chartreuse shadow-pop" : "bg-cream"}`}
          >
            <input
              type="radio"
              name={`${id}-ceiling`}
              checked={draft.ceiling?.kind === "cap"}
              onChange={() =>
                update({ ceiling: { kind: "cap", cad: Math.max(draft.preferredMaxCad, 0) } })
              }
              className="sr-only"
            />
            Set a hard ceiling
          </label>
          <label
            className={`paper flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 border-crust px-4 py-3 text-sm font-bold focus-within:ring-4 focus-within:ring-vista/50 ${draft.ceiling?.kind === "unlimited" ? "bg-chartreuse shadow-pop" : "bg-cream"}`}
          >
            <input
              type="radio"
              name={`${id}-ceiling`}
              checked={draft.ceiling?.kind === "unlimited"}
              onChange={() => update({ ceiling: { kind: "unlimited" } })}
              className="sr-only"
            />
            No hard limit
          </label>
        </div>
        {draft.ceiling?.kind === "cap" && (
          <BoundInput
            id={`${id}-cap`}
            label="Never more than (CAD)"
            value={capValue === "" ? 0 : capValue}
            min={draft.preferredMaxCad}
            onChange={(value) => update({ ceiling: { kind: "cap", cad: normalizeBudget(value) } })}
            className="mt-4"
          />
        )}
        {!draft.ceiling && (
          <p className="mt-3 text-sm font-bold">Choose one — there's no default.</p>
        )}
      </fieldset>
      <Hint>
        Amounts are estimated cost per person for the activity itself. Travel and extra food or
        drinks you choose to buy are not included. Map price levels ($–$$$$) aren't treated as real
        prices.
      </Hint>
      <PrivateNote>Your budget is private — not even the host sees it.</PrivateNote>
    </>
  );
}

function BoundInput({
  id,
  label,
  value,
  onChange,
  min = 0,
  className = "",
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  className?: string;
}) {
  // Typing is free-form; the value snaps to a $5 step when the field loses focus.
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label htmlFor={id} className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider">{label}</span>
      <span className="paper flex h-12 items-center rounded-2xl border-2 border-crust bg-cream px-3 focus-within:ring-4 focus-within:ring-vista/40">
        <span aria-hidden="true" className="font-bold">
          $
        </span>
        <input
          id={id}
          aria-label={label}
          type="number"
          inputMode="numeric"
          min={min}
          max={BUDGET_MAX}
          step={BUDGET_STEP}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            const next = Number(text);
            onChange(text.trim() === "" || !Number.isFinite(next) ? value : next);
            setText(String(value));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          }}
          className="h-full w-full bg-transparent px-1 font-bold focus:outline-none"
        />
      </span>
    </label>
  );
}

function RangeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        type="range"
        min={0}
        max={BUDGET_MAX}
        step={BUDGET_STEP}
        value={value}
        aria-valuetext={`$${value}`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full accent-[var(--tangerine)]"
      />
    </label>
  );
}
