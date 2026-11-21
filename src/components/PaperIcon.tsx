import type { ReactNode } from "react";

export type PaperTone = "chartreuse" | "sage" | "apricot" | "tangerine" | "vista" | "cream";

const TONES: Record<PaperTone, string> = {
  chartreuse: "bg-chartreuse",
  sage: "bg-sage",
  apricot: "bg-apricot",
  tangerine: "bg-tangerine",
  vista: "bg-vista",
  cream: "bg-cream",
};

/** An icon printed on a small sheet of coloured paper, cut out and stuck on at a tilt. */
export function PaperIcon({
  tone = "chartreuse",
  back = "cream",
  rotate = -6,
  shape = "square",
  className = "",
  children,
}: {
  tone?: PaperTone;
  back?: PaperTone | null;
  rotate?: number;
  shape?: "square" | "circle";
  className?: string;
  children: ReactNode;
}) {
  const round = shape === "circle" ? "rounded-full" : "rounded-[9px]";
  return (
    <span aria-hidden="true" className={`relative inline-grid shrink-0 place-items-center ${className}`}>
      {back && (
        <span
          className={`paper absolute inset-0 border-2 border-crust ${round} ${TONES[back]}`}
          style={{ transform: `rotate(${-rotate * 1.5}deg) translate(2px, 3px)` }}
        />
      )}
      <span
        className={`paper relative grid h-full w-full place-items-center border-2 border-crust text-crust shadow-pop ${round} ${TONES[tone]}`}
        style={{ transform: `rotate(${rotate}deg)` }}
      >
        {children}
      </span>
    </span>
  );
}
