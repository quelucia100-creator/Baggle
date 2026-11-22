import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Brush, Check, Eraser, RotateCcw, Trash2 } from "lucide-react";
import { formatLongDate, isPastSlot, daySlots, formatDate, type Slot } from "./time";
import type { DayDraft } from "./member-model";

export const GRID_COLUMNS = 6;
type Tool = "paint" | "erase";
type Drag = { pointerId: number; anchor: number; current: number; moved: boolean };

const slotText = (slot: Slot) => `${slot.hour % 12 || 12}:${String(slot.minute).padStart(2, "0")}`;

/**
 * One day's 30-minute availability grid. Red = busy.
 * - Drag (touch, pen or mouse) paints or erases a continuous time range from the start
 *   cell to the cell under the pointer. Pointer capture keeps the drag on the grid and
 *   `touch-action: none` applies only to the cells, so the time labels still scroll.
 * - Tap / click / Enter / Space toggles one cell; arrow keys move between cells.
 * Past and clock-change cells are not paintable.
 */
export function BusyGrid({
  date,
  now,
  value,
  onChange,
  onUndo,
  canUndo,
  recurringWeekday,
}: {
  date?: string;
  now?: number;
  recurringWeekday?: string;
  value: DayDraft;
  onChange: (next: DayDraft) => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  // A normal civil day supplies fixed clock labels for a recurring template;
  // it never enters saved data or the rendered weekday UI.
  const slots = useMemo(() => daySlots(recurringWeekday ? "2026-01-12" : date ?? ""), [date, recurringWeekday]);
  const dayLabel = recurringWeekday ?? formatLongDate(date ?? "");
  const busy = useMemo(() => new Set(value.busy), [value.busy]);
  const [tool, setTool] = useState<Tool>("paint");
  const [drag, setDrag] = useState<Drag | null>(null);
  const suppressClick = useRef(false);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const paintable = (slot: Slot) => Boolean(recurringWeekday) || (slot.startMs !== null && !isPastSlot(slot, now ?? Date.now()));
  const commit = (next: Set<number>, confirmed = false) =>
    onChange({ busy: [...next].sort((a, b) => a - b), confirmed });

  const range = (a: number, b: number) => {
    const [from, to] = a <= b ? [a, b] : [b, a];
    return slots
      .slice(from, to + 1)
      .filter(paintable)
      .map((slot) => slot.index);
  };
  const preview = drag?.moved ? new Set(range(drag.anchor, drag.current)) : null;

  const slotFromPoint = (x: number, y: number) => {
    const node = document.elementFromPoint?.(x, y)?.closest?.("[data-slot]");
    const index = node ? Number(node.getAttribute("data-slot")) : NaN;
    return Number.isInteger(index) ? index : null;
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const cell = (event.target as HTMLElement).closest("[data-slot]");
    if (!cell) return;
    const index = Number(cell.getAttribute("data-slot"));
    const slot = slots[index];
    if (!slot || !paintable(slot)) return;
    suppressClick.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ pointerId: event.pointerId, anchor: index, current: index, moved: false });
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const index = slotFromPoint(event.clientX, event.clientY);
    if (index === null || index === drag.current) return;
    setDrag({ ...drag, current: index, moved: true });
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    // Pointer capture retargets a tap's click to the grid, not the cell.
    // Commit both taps and drags here, and ignore their following synthetic click.
    suppressClick.current = true;
    const next = new Set(busy);
    if (drag.moved) {
      for (const index of range(drag.anchor, drag.current)) {
        if (tool === "paint") next.add(index);
        else next.delete(index);
      }
    } else {
      if (next.has(drag.anchor)) next.delete(drag.anchor);
      else next.add(drag.anchor);
    }
    commit(next);
    setDrag(null);
  };
  const toggle = (index: number) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const slot = slots[index];
    if (!slot || !paintable(slot)) return;
    const next = new Set(busy);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    commit(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -GRID_COLUMNS, ArrowDown: GRID_COLUMNS }[
      event.key
    ];
    if (!step) return;
    event.preventDefault();
    const target = index + step;
    if (target >= 0 && target < slots.length) cellRefs.current[target]?.focus();
  };

  const allPaintable = slots.filter(paintable).map((slot) => slot.index);
  const rows = Array.from({ length: slots.length / GRID_COLUMNS }, (_, row) =>
    slots.slice(row * GRID_COLUMNS, row * GRID_COLUMNS + GRID_COLUMNS),
  );
  const firstFocusable = allPaintable[0] ?? 0;
  const busyCount = allPaintable.filter((index) => busy.has(index)).length;

  return (
    <div>
      <div
        className="mb-3 flex flex-wrap items-center gap-2"
        role="toolbar"
        aria-label={`Tools for ${dayLabel}`}
      >
        <ToolButton
          pressed={tool === "paint"}
          onClick={() => setTool("paint")}
          icon={<Brush className="h-4 w-4" />}
        >
          Paint busy
        </ToolButton>
        <ToolButton
          pressed={tool === "erase"}
          onClick={() => setTool("erase")}
          icon={<Eraser className="h-4 w-4" />}
        >
          Erase
        </ToolButton>
        <ToolButton onClick={onUndo} disabled={!canUndo} icon={<RotateCcw className="h-4 w-4" />}>
          Undo
        </ToolButton>
        <ToolButton
          onClick={() => commit(new Set())}
          disabled={!busyCount}
          icon={<Trash2 className="h-4 w-4" />}
        >
          Clear
        </ToolButton>
      </div>
      <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 rounded-sm border-2 border-crust bg-destructive"
          />
          Busy
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 rounded-sm border-2 border-crust bg-sage"
          />
          Free (once you confirm the day)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 rounded-sm border-2 border-dashed border-crust/40"
          />
          Not available
        </span>
      </p>
      <div
        role="group"
        aria-label={`Busy times on ${dayLabel}, Montréal time`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onClick={() => { suppressClick.current = false; }}
        className="select-none"
      >
        {rows.map((row, rowIndex) => (
          <div key={rowIndex}>
            {rowIndex === 8 && (
              <p className="mb-1 mt-3 border-t-2 border-dashed border-crust/30 pt-2 text-xs font-extrabold uppercase">
                After midnight · {recurringWeekday ? "Next day" : formatDate(row[0]?.civilDate ?? date ?? "")}
              </p>
            )}
            <div className="mb-1.5 grid grid-cols-[3.25rem_repeat(6,minmax(0,1fr))] gap-1">
              {/* The label gutter keeps normal vertical scrolling on touch screens. */}
              <span className="flex touch-pan-y items-center text-[11px] font-bold leading-tight">
                {row[0]?.label.replace(":00", "")}
              </span>
              {row.map((slot) => {
                const isBusy = busy.has(slot.index);
                const isPreview = preview?.has(slot.index);
                const disabled = !paintable(slot);
                const state =
                  slot.clock === "skipped"
                    ? "skipped by the clock change"
                    : disabled
                      ? "already passed"
                      : isBusy
                        ? "busy"
                        : "free";
                const end = slots[slot.index + 1]?.label ?? "6:00 AM";
                return (
                  <button
                    key={slot.index}
                    ref={(node) => {
                      cellRefs.current[slot.index] = node;
                    }}
                    type="button"
                    data-slot={slot.index}
                    aria-pressed={disabled ? undefined : isBusy}
                    aria-disabled={disabled || undefined}
                    aria-label={`${slot.label} to ${end}${slot.overnight ? " (next day)" : ""}${slot.clock === "repeated" ? ", repeated hour: blocks both" : ""}, ${state}`}
                    tabIndex={slot.index === firstFocusable ? 0 : -1}
                    onClick={() => toggle(slot.index)}
                    onKeyDown={(event) => onKeyDown(event, slot.index)}
                    className={`h-11 touch-none rounded-md border-2 text-[10px] font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-vista/60 ${
                      disabled
                        ? "cursor-not-allowed border-dashed border-crust/30 bg-transparent text-crust/40"
                        : isPreview
                          ? tool === "paint"
                            ? "border-crust bg-destructive/60 text-offwhite"
                            : "border-crust bg-offwhite ring-2 ring-crust"
                          : isBusy
                            ? "border-crust bg-destructive text-offwhite"
                            : value.confirmed
                              ? "border-crust/50 bg-sage"
                              : "border-crust/40 bg-cream"
                    }`}
                  >
                    {slot.clock === "skipped" ? "—" : slotText(slot)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {drag?.moved && (
        <p role="status" className="mt-2 text-sm font-bold">
          {tool === "paint" ? "Painting busy" : "Erasing"}:{" "}
          {slots[Math.min(drag.anchor, drag.current)]?.label} –{" "}
          {slots[Math.max(drag.anchor, drag.current) + 1]?.label ?? "6:00 AM"}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Drag across cells to {tool === "paint" ? "paint busy time" : "erase busy time"}, or tap one
        cell to switch it. To scroll on a phone, swipe on the times at the left.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <ToolButton onClick={() => commit(new Set(), true)} icon={<Check className="h-4 w-4" />}>
          I'm free all day
        </ToolButton>
        <ToolButton onClick={() => commit(new Set(allPaintable))}>Busy all day</ToolButton>
      </div>
    </div>
  );
}

function ToolButton({
  pressed,
  onClick,
  disabled,
  icon,
  children,
}: {
  pressed?: boolean | undefined;
  onClick: () => void;
  disabled?: boolean | undefined;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`paper flex min-h-11 items-center justify-center gap-1.5 rounded-lg border-2 border-crust px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-vista/50 disabled:opacity-40 ${pressed ? "bg-chartreuse shadow-pop" : "bg-cream hover:bg-apricot"}`}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}
