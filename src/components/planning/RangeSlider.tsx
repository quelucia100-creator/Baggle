import * as SliderPrimitive from "@radix-ui/react-slider";

const thumbClass =
  "paper block h-8 w-8 cursor-grab rounded-full border-2 border-crust bg-tangerine shadow-pop transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-vista/50 active:cursor-grabbing active:scale-110 disabled:pointer-events-none disabled:opacity-50";

interface RangeSliderProps {
  value: number[];
  onValueChange: (value: number[]) => void;
  min: number;
  max: number;
  step?: number;
  minStepsBetweenThumbs?: number;
  /** One accessible name per thumb, e.g. ["Free from", "Free until"]. */
  thumbLabels: string[];
  /** Spoken value per thumb, e.g. "7:30 PM". */
  valueText?: (index: number, value: number) => string;
  disabled?: boolean;
  /** Evenly spaced labels along the track, first at min and last at max. */
  marks?: readonly string[];
  /** Vertical sliders run top (min) to bottom (max). */
  orientation?: "horizontal" | "vertical";
}

/** Paper-styled Radix slider that renders one thumb per value (one or two). */
export function RangeSlider({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  minStepsBetweenThumbs = 0,
  thumbLabels,
  valueText,
  disabled = false,
  marks,
  orientation = "horizontal",
}: RangeSliderProps) {
  const vertical = orientation === "vertical";
  return (
    <div className={vertical ? "flex h-64 gap-2" : "w-full"}>
      <SliderPrimitive.Root
        value={value}
        onValueChange={onValueChange}
        min={min}
        max={max}
        step={step}
        minStepsBetweenThumbs={minStepsBetweenThumbs}
        disabled={disabled}
        orientation={orientation}
        inverted={vertical}
        className={`relative flex touch-none select-none items-center ${vertical ? "h-full w-10 flex-col" : "h-10 w-full"}`}
      >
        <SliderPrimitive.Track
          className={`relative grow overflow-hidden rounded-full border-2 border-crust bg-cream ${vertical ? "h-full w-3" : "h-3 w-full"}`}
        >
          <SliderPrimitive.Range className={`absolute bg-sage ${vertical ? "w-full" : "h-full"}`} />
        </SliderPrimitive.Track>
        {value.map((thumb, index) => (
          <SliderPrimitive.Thumb
            key={thumbLabels[index] ?? index}
            aria-label={thumbLabels[index]}
            aria-valuetext={valueText?.(index, thumb)}
            className={thumbClass}
          />
        ))}
      </SliderPrimitive.Root>
      {marks && (
        <div
          aria-hidden="true"
          className={`flex justify-between text-xs font-bold text-muted-foreground ${vertical ? "h-full flex-col" : "mt-1"}`}
        >
          {marks.map((mark, i) => (
            <span
              key={i}
              className={vertical ? "leading-none" : "min-w-0 first:text-left last:text-right"}
            >
              {mark}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
