import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { PopButton } from "@/components/Field";
import { Button } from "@/components/ui/button";

export type WizardSubmit = (command: import("./model").PlanningCommand) => Promise<boolean>;
export function WizardFrame({
  step,
  total,
  title,
  label,
  description,
  children,
  busy,
  error,
  back,
  next,
  action = "Next",
  privateAnswers = false,
}: {
  step: number;
  total: number;
  title: string;
  label: string;
  description: string;
  children: ReactNode;
  busy: boolean;
  error: string;
  back: () => void;
  next: () => void;
  action?: string;
  privateAnswers?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  useEffect(() => {
    progress.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
    heading.current?.focus({ preventScroll: true });
  }, [step]);
  return (
    <section aria-label={label} className="min-w-0">
      <div
        ref={progress}
        className="paper sticky top-0 z-10 border-y-2 border-crust/15 bg-offwhite py-4"
      >
        <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold uppercase">
          <span className="flex items-center gap-2">
            {privateAnswers && <LockKeyhole className="h-4 w-4" />}
            {label}
          </span>
          <span>
            Step {step + 1} / {total}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`${label} progress`}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={step + 1}
          className="flex gap-2"
        >
          {Array.from({ length: total }, (_, index) => (
            <span
              key={index}
              className={`h-2 flex-1 rounded-sm ${index <= step ? "bg-crust" : "bg-crust/15"}`}
            />
          ))}
        </div>
      </div>
      <div key={step} className="wizard-enter min-h-80 py-7 sm:py-9">
        <h2
          ref={heading}
          tabIndex={-1}
          className="mb-3 text-3xl font-extrabold outline-none sm:text-4xl"
        >
          {title}
        </h2>
        <p className="mb-7 max-w-lg text-sm leading-relaxed text-muted-foreground">{description}</p>
        {children}
        {error && (
          <p role="alert" className="mt-5 border-l-4 border-crust bg-apricot p-3 text-sm font-bold">
            {error}
          </p>
        )}
      </div>
      <div className="paper sticky bottom-0 z-10 grid grid-cols-[auto_minmax(0,1fr)] gap-4 border-t-2 border-crust/15 bg-offwhite py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          variant="outline"
          disabled={busy}
          onClick={back}
          className="h-12 border-2 bg-offwhite px-5 font-bold"
        >
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
        <PopButton
          disabled={busy}
          onClick={next}
          className="flex h-auto min-h-12 items-center justify-center gap-2 px-4 py-3"
        >
          {busy ? "Saving…" : action}
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </PopButton>
      </div>
    </section>
  );
}

export function Choice({
  selected,
  children,
  onClick,
  label,
}: {
  selected: boolean;
  children: ReactNode;
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button
      variant="outline"
      aria-pressed={selected}
      {...(label ? { "aria-label": label } : {})}
      onClick={onClick}
      className={`paper h-auto min-h-20 w-full justify-start whitespace-normal rounded-lg border-2 px-4 py-4 text-left text-base font-bold focus-visible:ring-4 ${selected ? "bg-chartreuse shadow-pop hover:bg-chartreuse" : "bg-cream hover:bg-apricot"}`}
    >
      {children}
    </Button>
  );
}
