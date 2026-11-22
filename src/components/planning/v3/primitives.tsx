import { useId, type ReactNode } from "react";
import { AlertTriangle, Check, Info, LockKeyhole } from "lucide-react";

const tileBase =
  "paper flex min-h-14 w-full cursor-pointer items-start gap-3 rounded-lg border-2 border-crust px-4 py-3 text-left text-sm font-bold transition-colors focus-within:ring-4 focus-within:ring-vista/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-vista/50 disabled:cursor-not-allowed disabled:opacity-50";

/** Toggle button tile with visible pressed state for multi-select questions. */
export function ToggleTile({
  pressed,
  onToggle,
  disabled,
  children,
  hint,
  label,
}: {
  pressed: boolean;
  onToggle: () => void;
  disabled?: boolean | undefined;
  children: ReactNode;
  hint?: string | undefined;
  label?: string | undefined;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`${tileBase} ${pressed ? "bg-chartreuse shadow-pop" : "bg-cream hover:bg-apricot"}`}
    >
      <span className="min-w-0 flex-1">
        {children}
        {hint && <span className="mt-1 block text-xs font-normal">{hint}</span>}
      </span>
      {pressed && <Check aria-hidden="true" className="h-5 w-5 shrink-0" />}
    </button>
  );
}

/** Native radio group rendered as tiles, so arrow keys and screen readers behave natively. */
export function RadioTiles<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  columns = 1,
  disabled,
  describedBy,
}: {
  legend: string;
  name: string;
  value: T | null;
  options: { value: T; title: string; note?: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  columns?: 1 | 2 | 3 | 4 | undefined;
  disabled?: boolean | undefined;
  describedBy?: string | undefined;
}) {
  const grid = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[
    columns
  ];
  return (
    <fieldset disabled={disabled} aria-describedby={describedBy} className="min-w-0">
      <legend className="mb-2 text-xs font-bold uppercase tracking-wider">{legend}</legend>
      <div className={`grid gap-3 ${grid}`}>
        {options.map((option) => (
          <label
            key={option.value}
            className={`${tileBase} ${value === option.value ? "bg-chartreuse shadow-pop" : "bg-cream hover:bg-apricot"}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.icon && <span aria-hidden="true">{option.icon}</span>}
            <span className="min-w-0 flex-1">
              {option.title}
              {option.note && <span className="mt-1 block text-xs font-normal">{option.note}</span>}
            </span>
            {value === option.value && <Check aria-hidden="true" className="h-5 w-5 shrink-0" />}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CheckTile({
  checked,
  onChange,
  title,
  note,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  note?: string | undefined;
  disabled?: boolean | undefined;
}) {
  return (
    <label
      className={`${tileBase} ${checked ? "bg-chartreuse shadow-pop" : "bg-cream hover:bg-apricot"} ${disabled ? "opacity-50" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--crust)]"
      />
      <span className="min-w-0 flex-1">
        {title}
        {note && <span className="mt-1 block text-xs font-normal">{note}</span>}
      </span>
    </label>
  );
}

export function InlineError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-3 flex items-start gap-2 border-l-4 border-crust bg-apricot p-3 text-sm font-bold"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      {children}
    </p>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
      <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function PrivateNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 text-xs font-semibold">
      <LockKeyhole aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Explains why something cannot be saved yet. Never presented as success. */
export function BackendPendingNotice({ what }: { what: string }) {
  return (
    <div
      role="note"
      className="paper rounded-lg border-2 border-dashed border-crust bg-cream p-4 text-sm"
    >
      <p className="font-extrabold">Requires backend update</p>
      <p className="mt-1">
        {what} can't be saved until the V3 planning server is live. Your draft stays on this screen
        only and has not been sent or stored.
      </p>
    </div>
  );
}

export function Section({
  title,
  index,
  children,
  error,
  description,
}: {
  title: string;
  index?: number | undefined;
  children: ReactNode;
  error?: string | undefined;
  description?: string | undefined;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="border-b-2 border-crust/15 py-7 first:pt-0 last:border-b-0"
    >
      <h2 id={`${id}-title`} className="flex items-baseline gap-3 text-xl font-extrabold">
        {index !== undefined && (
          <span
            aria-hidden="true"
            className="paper inline-grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-crust bg-chartreuse text-sm"
          >
            {index}
          </span>
        )}
        {title}
      </h2>
      {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5 space-y-5">{children}</div>
      <InlineError>{error}</InlineError>
    </section>
  );
}
