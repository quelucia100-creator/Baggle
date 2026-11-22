import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaperIcon } from "@/components/PaperIcon";

type PlanStepProps = {
  icon: LucideIcon;
  index: number;
  total: number;
  title: string;
  hint: string;
  isLast: boolean;
  canNext: boolean;
  isBusy: boolean;
  backLabel: string;
  onBack: () => void;
  onNext: () => void;
  children: ReactNode;
};

/** Shared shell for one wizard question: icon, counter, progress bar and Back/Next. */
export function PlanStep({
  icon: Icon,
  index,
  total,
  title,
  hint,
  isLast,
  canNext,
  isBusy,
  backLabel,
  onBack,
  onNext,
  children,
}: PlanStepProps) {
  const nextLabel = isLast ? "Save my answers" : "Next";
  return (
    <section
      aria-labelledby="plan-step-title"
      className="paper mx-auto w-full max-w-md rounded-2xl border-2 border-crust bg-offwhite p-6 shadow-pop sm:p-8"
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <PaperIcon tone="sage" back="apricot" className="h-14 w-14">
          <Icon className="h-7 w-7" />
        </PaperIcon>
        <span className="text-sm font-bold text-muted-foreground">
          {index + 1} / {total}
        </span>
      </div>
      <h1 id="plan-step-title" className="text-3xl font-extrabold">
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
      <div
        aria-label={`Step ${index + 1} of ${total}`}
        className="my-6 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 ${i <= index ? "bg-tangerine" : "bg-crust/20"}`} />
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canNext && !isBusy) onNext();
        }}
      >
        {children}
        <div className="mt-8 flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="outline"
            size="icon"
            title={backLabel}
            aria-label={backLabel}
            disabled={isBusy}
            onClick={onBack}
            className="paper h-12 w-12 border-2 border-crust bg-cream"
          >
            <ArrowLeft />
          </Button>
          <Button
            type="submit"
            title={nextLabel}
            aria-label={nextLabel}
            disabled={isBusy || !canNext}
            className="paper h-12 min-w-16 border-2 border-crust bg-tangerine text-crust shadow-pop pop-press"
          >
            {isBusy ? <span>Saving…</span> : isLast ? <Check /> : <ArrowRight />}
          </Button>
        </div>
      </form>
    </section>
  );
}

type ChoiceProps = {
  name: string;
  selected: boolean;
  label: string;
  note?: string;
  /** Decorative emoji shown before the label (hidden from screen readers). */
  emoji?: string;
  onSelect: () => void;
};

/** Single-choice radio card in the paper style used by the account wizard. */
export function ChoiceCard({ name, selected, label, note, emoji, onSelect }: ChoiceProps) {
  return (
    <label
      className={`paper flex min-h-14 cursor-pointer items-center gap-2.5 rounded-md border-2 border-crust px-3 py-3 ${selected ? "bg-sage" : "bg-cream"}`}
    >
      <input
        type="radio"
        name={name}
        checked={selected}
        onChange={onSelect}
        className="h-4 w-4 accent-crust"
      />
      {emoji && (
        <span aria-hidden="true" className="text-2xl leading-none">
          {emoji}
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="font-bold">{label}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </span>
    </label>
  );
}
