import { Temporal } from "@js-temporal/polyfill";
import type { AvailabilityDay } from "./account-availability-model";
import { daySlots, slotsToIntervals } from "@/components/planning/v3/time";
import type { MemberContext, MemberDraft } from "@/components/planning/v3/member-model";

export function recurringDay(rows: readonly AvailabilityDay[], date: string) {
  const weekday = Temporal.PlainDate.from(date).dayOfWeek;
  return rows.find((row) => row.weekday === weekday && row.confirmed);
}
export function recurringFreeSlots(rows: readonly AvailabilityDay[], date: string, limit = 48) {
  const saved = recurringDay(rows, date);
  if (!saved) return null;
  const busy = new Set(saved.busy);
  return Array.from({ length: limit }, (_, index) => index).filter((slot) => !busy.has(slot));
}
/** Conservative projection: a tonight-only contract gets one actual continuous free stretch,
 * never an envelope that invents free time across a busy gap. */
export function recurringV3(rows: readonly AvailabilityDay[], context: MemberContext): Partial<MemberDraft> | null {
  if (!context.candidateDates.length) return null;
  if (context.availabilityMode === "calendar") {
    if (context.candidateDates.some((date) => !recurringDay(rows, date))) return null;
    return { days: Object.fromEntries(context.candidateDates.map((date) => [date, {
      busy: [...(recurringDay(rows, date)?.busy ?? [])], confirmed: true,
    }])) };
  }
  const date = context.candidateDates[0];
  if (!date) return null;
  const free = recurringFreeSlots(rows, date, 60);
  if (!free) return null;
  const slots = daySlots(date);
  const available = new Set(free.filter((index) => (slots[index]?.startMs ?? 0) >= context.now));
  const windows = slotsToIntervals(slots, available);
  // slotsToIntervals treats its set as selected intervals, regardless of free/busy semantics.
  const best = windows.filter((window) => Date.parse(window.endAt) - Date.parse(window.startAt) >= context.minMinutes * 60000)
    .sort((a, b) => (Date.parse(b.endAt) - Date.parse(b.startAt)) - (Date.parse(a.endAt) - Date.parse(a.startAt)))[0];
  return best ? { departure: { kind: "at", at: best.startAt }, returnBy: { kind: "at", at: best.endAt } } : null;
}

export function recurringLegacyWindow(rows: readonly AvailabilityDay[], date: string, minMinutes: number, minSlot = 0) {
  const free = recurringFreeSlots(rows, date, 60);
  if (!free) return null;
  const runs: Array<{ from: number; to: number }> = [];
  for (const index of free.filter((slot) => slot >= minSlot)) {
    const last = runs.at(-1);
    if (last?.to === index) last.to = index + 1;
    else runs.push({ from: index, to: index + 1 });
  }
  const best = runs.filter((run) => run.from < 48 && (run.to - run.from) * 30 >= minMinutes)
    .sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
  const clock = (index: number) => `${String(Math.floor((index % 48) / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`;
  return best ? { freeFrom: clock(best.from), freeTo: clock(best.to) } : null;
}