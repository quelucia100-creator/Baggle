import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { DayFree } from "@/lib/planning/wizard";
import { AvailabilityCalendar, SLOT_PX } from "./AvailabilityCalendar";

// jsdom's pointer events drop clientX/clientY; a MouseEvent-based stand-in keeps them.
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
globalThis.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;

const wed = "2026-11-25";
const sat = "2026-11-28";
const COLUMN_WIDTH = 100;
let latest: Record<string, DayFree> = {};

function Harness({
  initial = {},
  minSlotFor,
}: {
  initial?: Record<string, DayFree>;
  minSlotFor?: (date: string) => number;
}) {
  const [value, setValue] = useState<Record<string, DayFree>>(initial);
  latest = value;
  return (
    <AvailabilityCalendar
      days={[wed, sat]}
      value={value}
      gap={3}
      onChange={setValue}
      {...(minSlotFor ? { minSlotFor } : {})}
    />
  );
}

const column = (long: string) => screen.getByRole("group", { name: `Free time on ${long}` });
const block = (label: RegExp) => screen.getByRole("button", { name: label });
/** Pointer position for a half-hour slot in a day column (jsdom has no layout). */
const at = (columnIndex: number, slot: number) => ({
  clientX: columnIndex * COLUMN_WIDTH + 10,
  clientY: slot * SLOT_PX + 5,
});
const scroller = () => { const element = column("Wednesday, November 25").parentElement?.parentElement; if (!element) throw new Error("Missing calendar scroller"); return element; };
function press(target: Element, columnIndex: number, slot: number) {
  fireEvent.pointerDown(target, {
    pointerId: 1,
    button: 0,
    pointerType: "mouse",
    ...at(columnIndex, slot),
  });
}
function moveTo(columnIndex: number, slot: number) {
  fireEvent.pointerMove(scroller(), { pointerId: 1, ...at(columnIndex, slot) });
}
const release = () => fireEvent.pointerUp(scroller(), { pointerId: 1 });

beforeEach(() => {
  // Two side-by-side columns starting at the top of the page.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const index = [wed, sat].indexOf(this.getAttribute("data-day") ?? "");
    const left = Math.max(0, index) * COLUMN_WIDTH;
    return {
      top: 0,
      left,
      right: left + COLUMN_WIDTH,
      bottom: 48 * SLOT_PX,
      width: COLUMN_WIDTH,
      height: 48 * SLOT_PX,
      x: left,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Availability calendar", () => {
  it("shows one column per offered day, side by side", () => {
    render(<Harness />);
    expect(column("Wednesday, November 25")).toBeInTheDocument();
    expect(column("Saturday, November 28")).toBeInTheDocument();
    expect(screen.getByText(/drag down a day's line/)).toBeInTheDocument();
  });

  it("adds a free block by dragging down a day", () => {
    render(<Harness />);
    press(column("Wednesday, November 25"), 0, 18); // 9:00 AM
    moveTo(0, 21); // through 10:30 AM
    release();
    expect(block(/^Free 9:00 AM – 11:00 AM on Wednesday/)).toBeInTheDocument();
    expect(latest[wed]).toEqual([18, 19, 20, 21]);
  });

  it("adds a hangout-length block on a tap", () => {
    render(<Harness />);
    press(column("Saturday, November 28"), 1, 36); // 6:00 PM
    release();
    expect(block(/^Free 6:00 PM – 7:30 PM on Saturday/)).toBeInTheDocument();
  });

  it("keeps morning and evening blocks separate around a busy midday", () => {
    render(<Harness initial={{ [wed]: [18, 19, 20, 21] }} />);
    press(column("Wednesday, November 25"), 0, 36);
    moveTo(0, 39);
    release();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Wednesday, November 25: free 9:00 AM – 11:00 AM, 6:00 PM – 8:00 PM",
    );
  });

  it("moves a block to a new time and onto another day", () => {
    render(<Harness initial={{ [wed]: [18, 19, 20, 21] }} />);
    const morning = block(/^Free 9:00 AM – 11:00 AM on Wednesday/);
    press(morning, 0, 19); // grab half an hour into the block
    moveTo(1, 29); // Saturday, 2:30 PM under the pointer
    release();
    expect(latest).toEqual({ [wed]: [], [sat]: [28, 29, 30, 31] });
    expect(block(/^Free 2:00 PM – 4:00 PM on Saturday/)).toBeInTheDocument();
  });

  it("resizes a block by dragging its bottom edge", () => {
    const { container } = render(<Harness initial={{ [wed]: [18, 19, 20, 21] }} />);
    const edge = container.querySelector('[data-edge="end"]');
    if (!edge) throw new Error("Missing resize handle");
    press(edge, 0, 21);
    moveTo(0, 25); // to 1:00 PM
    release();
    expect(block(/^Free 9:00 AM – 1:00 PM on Wednesday/)).toBeInTheDocument();
  });

  it("removes a block after tapping it", () => {
    render(<Harness initial={{ [wed]: [18, 19, 20, 21] }} />);
    const morning = block(/^Free 9:00 AM – 11:00 AM on Wednesday/);
    press(morning, 0, 19);
    release();
    fireEvent.click(
      within(morning).getByRole("button", {
        name: "Remove free time 9:00 AM – 11:00 AM on Wednesday, November 25",
      }),
    );
    expect(latest[wed]).toEqual([]);
  });

  it("moves, resizes and removes blocks from the keyboard", () => {
    render(<Harness initial={{ [wed]: [18, 19, 20, 21] }} />);
    const morning = block(/^Free 9:00 AM – 11:00 AM on Wednesday/);
    fireEvent.keyDown(morning, { key: "ArrowDown" });
    expect(latest[wed]).toEqual([19, 20, 21, 22]);
    fireEvent.keyDown(block(/^Free 9:30 AM/), { key: "ArrowDown", shiftKey: true });
    expect(latest[wed]).toEqual([19, 20, 21, 22, 23]);
    fireEvent.keyDown(block(/^Free 9:30 AM/), { key: "ArrowRight" });
    expect(latest).toEqual({ [wed]: [], [sat]: [19, 20, 21, 22, 23] });
    fireEvent.keyDown(block(/^Free 9:30 AM – 12:00 PM on Saturday/), { key: "Delete" });
    expect(latest[sat]).toEqual([]);
  });

  it("keeps keyboard focus on a block moved to another day", () => {
    render(<Harness initial={{ [wed]: [18, 19, 20, 21] }} />);
    const morning = block(/^Free 9:00 AM – 11:00 AM on Wednesday/);
    morning.focus();
    fireEvent.keyDown(morning, { key: "ArrowRight" });
    expect(document.activeElement).toBe(block(/^Free 9:00 AM – 11:00 AM on Saturday/));
  });

  it("doesn't move the shortest block when shrinking it", () => {
    render(<Harness initial={{ [wed]: [18] }} />);
    fireEvent.keyDown(block(/^Free 9:00 AM/), { key: "ArrowUp", shiftKey: true });
    expect(latest[wed] ?? [18]).toEqual([18]);
  });

  it("flags blocks too short for the hangout", () => {
    render(<Harness initial={{ [wed]: [18] }} />);
    expect(block(/too short for the hangout/)).toBeInTheDocument();
  });

  it("marks a whole day free or clears it", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Saturday, November 28" }));
    fireEvent.click(screen.getByRole("button", { name: "Free all day" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Saturday, November 28: free 12:00 AM – Midnight",
    );
    expect(screen.getByRole("button", { name: "Saturday, November 28, free" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear day" }));
    expect(screen.getByRole("status")).toHaveTextContent("Saturday, November 28: not free");
  });

  it("doesn't let blocks start in the past today", () => {
    render(<Harness minSlotFor={(date) => (date === wed ? 30 : 0)} />);
    press(column("Wednesday, November 25"), 0, 10);
    release();
    expect(latest[wed] ?? []).toEqual([]);
    press(column("Wednesday, November 25"), 0, 28);
    moveTo(0, 33);
    release();
    expect(latest[wed]).toEqual([30, 31, 32, 33]);
  });
});
