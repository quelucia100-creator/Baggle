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
  /** Evenly spaced labels shown under the track, first at min and last at max. */
  marks?: readonly string[];
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
}: RangeSliderProps) {
  return (
    <div className="w-full">
      <SliderPrimitive.Root
        value={value}
        onValueChange={onValueChange}
        min={min}
        max={max}
        step={step}
        minStepsBetweenThumbs={minStepsBetweenThumbs}
        disabled={disabled}
        className="relative flex h-10 w-full touch-none select-none items-center"
      >
        <SliderPrimitive.Track className="relative h-3 w-full grow overflow-hidden rounded-full border-2 border-crust bg-cream">
          <SliderPrimitive.Range className="absolute h-full bg-sage" />
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
          className="mt-1 flex justify-between text-xs font-bold text-muted-foreground"
        >
          {marks.map((mark, i) => (
            <span key={i} className="min-w-0 first:text-left last:text-right">
              {mark}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
