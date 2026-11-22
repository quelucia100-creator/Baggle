import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Check, Trash2, X } from "lucide-react";
import { dayParts } from "@/lib/planning/tz";
import {
  DAY_SLOTS,
  freeRuns,
  moveBlock,
  movedStart,
  paintSlots,
  replaceBlock,
  slotLabel,
  type DayFree,
  type FreeBlock,
} from "@/lib/planning/wizard";

/** Height of one half-hour, in pixels. */
export const SLOT_PX = 22;
/** The calendar opens scrolled to 8 AM. */
const OPEN_AT_SLOT = 16;

type Gesture =
  | { kind: "create"; pointerId: number; day: string; anchor: number; current: number }
  | {
      kind: "move";
      pointerId: number;
      day: string;
      block: FreeBlock;
      grab: number;
      toDay: string;
      toStart: number;
      moved: boolean;
    }
  | {
      kind: "resize";
      pointerId: number;
      day: string;
      block: FreeBlock;
      edge: "start" | "end";
      next: FreeBlock;
    };

type Props = {
  days: string[];
  value: Readonly<Record<string, DayFree>>;
  /** Shortest useful block, in half-hours (the hangout's length). */
  gap: number;
  /** First half-hour that can still be picked on a day (later than 0 only for today). */
  minSlotFor?: (date: string) => number;
  onChange: (next: Record<string, DayFree>) => void;
};

const blockKey = (day: string, block: FreeBlock) => `${day}:${block.from}`;
const range = (block: FreeBlock) => `${slotLabel(block.from)} – ${slotLabel(block.to)}`;

/**
 * Google Calendar-style availability: one column per offered day, side by side.
 * Drag down a day's rail to add a free block (a tap adds one hangout-length block),
 * drag a block to move it (also onto another day), drag its top or bottom edge to resize,
 * and tap a block to remove it. Blocks are keyboard operable too.
 */
export function AvailabilityCalendar({ days, value, gap, minSlotFor = () => 0, onChange }: Props) {
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState(days[0] ?? "");
  const day = days.includes(activeDay) ? activeDay : (days[0] ?? "");
  const scroller = useRef<HTMLDivElement | null>(null);
  const columns = useRef<Record<string, HTMLDivElement | null>>({});

  // Open at 8 AM, or at the earliest block already there.
  useEffect(() => {
    const first = Math.min(
      OPEN_AT_SLOT,
      ...days.flatMap((date) => freeRuns(value[date] ?? []).map((run) => run.from)),
    );
    if (scroller.current) scroller.current.scrollTop = Math.max(0, first - 1) * SLOT_PX;
    // Only on first open; scrolling afterwards is the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slotIn = (date: string, clientY: number) => {
    const rect = columns.current[date]?.getBoundingClientRect();
    const slot = rect ? Math.floor((clientY - rect.top) / SLOT_PX) : 0;
    return Math.min(DAY_SLOTS - 1, Math.max(0, slot));
  };
  const dayAt = (clientX: number, fallback: string) =>
    days.find((date) => {
      const rect = columns.current[date]?.getBoundingClientRect();
      return rect && clientX >= rect.left && clientX < rect.right;
    }) ?? fallback;
  const update = (date: string, free: number[]) => onChange({ ...value, [date]: free });

  const startGesture = (event: PointerEvent<HTMLElement>, next: Gesture) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    event.stopPropagation();
    scroller.current?.setPointerCapture?.(event.pointerId);
    setActiveDay(next.day);
    setGesture(next);
  };
  const onRailDown = (event: PointerEvent<HTMLDivElement>, date: string) => {
    const slot = slotIn(date, event.clientY);
    setSelected(null);
    startGesture(event, {
      kind: "create",
      pointerId: event.pointerId,
      day: date,
      anchor: slot,
      current: slot,
    });
  };
  const onBlockDown = (event: PointerEvent<HTMLElement>, date: string, block: FreeBlock) =>
    startGesture(event, {
      kind: "move",
      pointerId: event.pointerId,
      day: date,
      block,
      grab: slotIn(date, event.clientY) - block.from,
      toDay: date,
      toStart: block.from,
      moved: false,
    });
  const onEdgeDown = (
    event: PointerEvent<HTMLElement>,
    date: string,
    block: FreeBlock,
    edge: "start" | "end",
  ) =>
    startGesture(event, {
      kind: "resize",
      pointerId: event.pointerId,
      day: date,
      block,
      edge,
      next: block,
    });

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === "create") {
      const current = slotIn(gesture.day, event.clientY);
      if (current !== gesture.current) setGesture({ ...gesture, current });
    } else if (gesture.kind === "move") {
      const toDay = dayAt(event.clientX, gesture.toDay);
      const toStart = slotIn(toDay, event.clientY) - gesture.grab;
      if (toDay !== gesture.toDay || toStart !== gesture.toStart)
        setGesture({ ...gesture, toDay, toStart, moved: true });
    } else {
      const slot = slotIn(gesture.day, event.clientY);
      const { block } = gesture;
      const next =
        gesture.edge === "start"
          ? { from: Math.min(slot, block.to - 1), to: block.to }
          : { from: block.from, to: Math.max(slot + 1, block.from + 1) };
      setGesture({ ...gesture, next });
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    scroller.current?.releasePointerCapture?.(event.pointerId);
    const min = minSlotFor(gesture.day);
    if (gesture.kind === "create") {
      // Drags starting in today's past are clamped to now; ones that stay in the past do nothing.
      const created = previewOf(gesture, gap, minSlotFor);
      if (created)
        update(
          gesture.day,
          paintSlots(value[gesture.day] ?? [], created.block.from, created.block.to - 1, true),
        );
    } else if (gesture.kind === "move") {
      if (gesture.moved)
        onChange(
          moveBlock(value, gesture.day, gesture.block, gesture.toDay, gesture.toStart, minSlotFor),
        );
      else {
        const key = blockKey(gesture.day, gesture.block);
        setSelected((current) => (current === key ? null : key));
      }
    } else {
      update(gesture.day, replaceBlock(value[gesture.day] ?? [], gesture.block, gesture.next, min));
    }
    setGesture(null);
  };

  // After a keyboard move to another day the block remounts there; keep focus on it.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  useEffect(() => {
    if (!focusKey) return;
    scroller.current
      ?.querySelector<HTMLElement>(`[data-block-key="${focusKey}"]`)
      ?.focus();
    setFocusKey(null);
  }, [focusKey, value]);
  const moveToDay = (date: string, block: FreeBlock, toDay: string) => {
    const start = movedStart(block.to - block.from, block.from, minSlotFor(toDay));
    if (start === null) return;
    onChange(moveBlock(value, date, block, toDay, block.from, minSlotFor));
    setFocusKey(blockKey(toDay, { from: start, to: start + block.to - block.from }));
  };

  const onBlockKey = (event: KeyboardEvent<HTMLElement>, date: string, block: FreeBlock) => {
    const free = value[date] ?? [];
    const min = minSlotFor(date);
    const index = days.indexOf(date);
    const shift = (by: number) => ({ from: block.from + by, to: block.to + by });
    const actions: Record<string, () => void> = {
      Delete: () => update(date, replaceBlock(free, block, null)),
      Backspace: () => update(date, replaceBlock(free, block, null)),
      ArrowUp: () =>
        event.shiftKey
          ? // Already the shortest block: nothing to shrink.
            block.to - block.from > 1 &&
            update(date, replaceBlock(free, block, { ...block, to: block.to - 1 }, min))
          : block.from > min && update(date, replaceBlock(free, block, shift(-1), min)),
      ArrowDown: () =>
        event.shiftKey
          ? block.to < DAY_SLOTS &&
            update(date, replaceBlock(free, block, { ...block, to: block.to + 1 }, min))
          : block.to < DAY_SLOTS && update(date, replaceBlock(free, block, shift(1), min)),
      ArrowLeft: () => index > 0 && moveToDay(date, block, days[index - 1]!),
      ArrowRight: () => index < days.length - 1 && moveToDay(date, block, days[index + 1]!),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const preview = previewOf(gesture, gap, minSlotFor);
  // The block being moved or resized fades while its preview follows the pointer.
  const lifted =
    gesture?.kind === "resize" || (gesture?.kind === "move" && gesture.moved)
      ? blockKey(gesture.day, gesture.block)
      : null;

  const activeParts = day ? dayParts(day) : null;
  const activeRuns = freeRuns(value[day] ?? []);
  const anyUsable = days.some((date) =>
    freeRuns(value[date] ?? []).some((run) => run.to - run.from >= gap),
  );
  const template = `3.25rem repeat(${days.length}, minmax(3.25rem, 1fr))`;
  return (
    <div>
      <div
        className="paper overflow-hidden rounded-2xl border-2 border-crust bg-offwhite"
        aria-label="Your free time, Montreal time"
        role="group"
      >
        <div
          className="grid border-b-2 border-crust bg-cream"
          style={{ gridTemplateColumns: template }}
        >
          <span aria-hidden="true" />
          {days.map((date) => {
            const parts = dayParts(date);
            const works = freeRuns(value[date] ?? []).some((run) => run.to - run.from >= gap);
            return (
              <button
                key={date}
                type="button"
                aria-pressed={date === day}
                aria-label={`${parts.long}${works ? ", free" : ""}`}
                onClick={() => setActiveDay(date)}
                className={`flex flex-col items-center py-1.5 font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-vista/60 ${date === day ? "bg-tangerine" : ""}`}
              >
                <span className="text-[11px] uppercase">{parts.short}</span>
                <span className="text-lg leading-tight">{parts.day}</span>
                <span aria-hidden="true" className="h-3.5">
                  {works && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
        <div
          ref={scroller}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setGesture(null)}
          className="max-h-[26rem] select-none overflow-y-auto"
        >
          <div className="grid" style={{ gridTemplateColumns: template }}>
            {/* Time labels: swipe here to scroll on a phone. */}
            <div
              className="relative touch-pan-y border-r-2 border-crust/20"
              style={{ height: DAY_SLOTS * SLOT_PX }}
            >
              {Array.from({ length: DAY_SLOTS / 2 }, (_, hour) => (
                <span
                  key={hour}
                  aria-hidden="true"
                  className="absolute right-1 -translate-y-1/2 text-[10px] font-bold text-crust/70"
                  style={{ top: hour * 2 * SLOT_PX }}
                >
                  {hour === 0 ? "" : slotLabel(hour * 2).replace(":00", "")}
                </span>
              ))}
            </div>
            {days.map((date) => {
              const parts = dayParts(date);
              const min = minSlotFor(date);
              const runs = freeRuns(value[date] ?? []);
              return (
                <div
                  key={date}
                  ref={(node) => {
                    columns.current[date] = node;
                  }}
                  data-day={date}
                  role="group"
                  aria-label={`Free time on ${parts.long}`}
                  onPointerDown={(event) => onRailDown(event, date)}
                  className="relative touch-none border-r border-crust/15 last:border-r-0"
                  style={{
                    height: DAY_SLOTS * SLOT_PX,
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${2 * SLOT_PX - 1}px, rgb(0 0 0 / 0.08) ${2 * SLOT_PX - 1}px, rgb(0 0 0 / 0.08) ${2 * SLOT_PX}px)`,
                  }}
                >
                  {/* The thick rail you draw free time onto. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-crust/15"
                  />
                  {min > 0 && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-0 bg-crust/10"
                      style={{ height: min * SLOT_PX }}
                    />
                  )}
                  {runs.map((block) => {
                    const key = blockKey(date, block);
                    const isMoving = lifted === key;
                    const short = block.to - block.from < gap;
                    const isSelected = selected === key;
                    return (
                      <div
                        key={key}
                        data-block-key={key}
                        role="button"
                        tabIndex={0}
                        aria-label={`Free ${range(block)} on ${parts.long}${short ? ", too short for the hangout" : ""}. Arrow keys move it, Shift and arrows resize, Delete removes.`}
                        onPointerDown={(event) => onBlockDown(event, date, block)}
                        onKeyDown={(event) => onBlockKey(event, date, block)}
                        className={`absolute inset-x-1 z-10 flex cursor-grab touch-none flex-col justify-between overflow-hidden rounded-lg border-2 border-crust text-[10px] font-bold leading-tight shadow-pop focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-vista/60 ${short ? "border-dashed bg-apricot" : "bg-sage"} ${isMoving ? "opacity-30" : ""} ${isSelected ? "ring-4 ring-crust" : ""}`}
                        style={{
                          top: block.from * SLOT_PX + 1,
                          height: (block.to - block.from) * SLOT_PX - 2,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          data-edge="start"
                          onPointerDown={(event) => onEdgeDown(event, date, block, "start")}
                          className="h-2 w-full shrink-0 cursor-ns-resize"
                        />
                        <span className="pointer-events-none px-1">{range(block)}</span>
                        <span
                          aria-hidden="true"
                          data-edge="end"
                          onPointerDown={(event) => onEdgeDown(event, date, block, "end")}
                          className="h-2 w-full shrink-0 cursor-ns-resize"
                        />
                        {isSelected && (
                          <button
                            type="button"
                            aria-label={`Remove free time ${range(block)} on ${parts.long}`}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => {
                              update(date, replaceBlock(value[date] ?? [], block, null));
                              setSelected(null);
                            }}
                            className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-crust bg-offwhite"
                          >
                            <X aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {preview && preview.day === date && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-1 z-20 rounded-lg border-2 border-dashed border-crust bg-sage/60"
                      style={{
                        top: preview.block.from * SLOT_PX + 1,
                        height: (preview.block.to - preview.block.from) * SLOT_PX - 2,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {activeParts && (
        <div className="mt-3">
          <p role="status" aria-live="polite" className="text-sm font-bold">
            {activeRuns.length
              ? `${activeParts.long}: free ${activeRuns.map(range).join(", ")}`
              : `${activeParts.long}: not free`}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <CalendarButton
              onClick={() => update(day, paintSlots([], minSlotFor(day), DAY_SLOTS - 1, true))}
              icon={<Check className="h-4 w-4" />}
            >
              Free all day
            </CalendarButton>
            <CalendarButton
              onClick={() => update(day, [])}
              disabled={!activeRuns.length}
              icon={<Trash2 className="h-4 w-4" />}
            >
              Clear day
            </CalendarButton>
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {anyUsable
          ? "Drag down a day to add free time, drag a block to move it, drag its top or bottom edge to resize, and tap it to remove. Swipe the times on the left to scroll."
          : "Pick at least one day that works for you: drag down a day's line to add when you're free."}
      </p>
    </div>
  );
}

/** Where the block being drawn, moved or resized would land. */
function previewOf(
  gesture: Gesture | null,
  gap: number,
  minSlotFor: (date: string) => number,
): { day: string; block: FreeBlock } | null {
  if (!gesture) return null;
  if (gesture.kind === "create") {
    const min = minSlotFor(gesture.day);
    if (Math.max(gesture.anchor, gesture.current) < min) return null;
    const from = Math.max(min, Math.min(gesture.anchor, gesture.current));
    const tapped = gesture.anchor === gesture.current;
    const to = tapped
      ? Math.min(DAY_SLOTS, from + Math.max(1, gap))
      : Math.max(gesture.anchor, gesture.current) + 1;
    return { day: gesture.day, block: { from, to } };
  }
  if (gesture.kind === "resize") return { day: gesture.day, block: gesture.next };
  if (!gesture.moved) return null;
  const length = gesture.block.to - gesture.block.from;
  const from = Math.min(DAY_SLOTS - length, Math.max(minSlotFor(gesture.toDay), gesture.toStart));
  return { day: gesture.toDay, block: { from, to: from + length } };
}

function CalendarButton({
  onClick,
  disabled,
  icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean | undefined;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="paper flex min-h-11 items-center justify-center gap-1.5 rounded-lg border-2 border-crust bg-cream px-3 text-sm font-bold hover:bg-apricot focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-vista/50 disabled:opacity-40"
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </button>
  );
}
