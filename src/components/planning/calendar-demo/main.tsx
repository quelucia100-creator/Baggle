/** LOCAL DEMO ONLY: the availability calendar with made-up days. No backend is contacted. */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "@/styles.css";
import { AvailabilityCalendar } from "../AvailabilityCalendar";
import { DayStep, type DayChoice } from "../DayStep";
import { montrealNowMinutes, montrealToday, shiftDate } from "@/lib/planning/tz";
import { dayWindowsFor, minGapSteps, STEP_MIN, type DayFree } from "@/lib/planning/wizard";

if (!import.meta.env.DEV) throw new Error("The availability calendar demo is development-only.");

const HANGOUT_MIN = 90;

function Demo() {
  const today = montrealToday();
  const todayMin = Math.floor(montrealNowMinutes() / STEP_MIN);
  const [choice, setChoice] = useState<DayChoice>({
    day: shiftDate(today, 1),
    pickedDays: [shiftDate(today, 1), shiftDate(today, 3), shiftDate(today, 4)],
  });
  const [value, setValue] = useState<Record<string, DayFree>>({});
  const days = choice.day === "today" ? [today] : choice.pickedDays;
  const gap = minGapSteps(HANGOUT_MIN);
  const saved = dayWindowsFor(value, days, gap);
  return (
    <main className="paper-sheet min-h-screen bg-offwhite px-4 py-8 text-crust">
      <div className="mx-auto max-w-2xl space-y-8">
        <p className="rounded-lg border-2 border-dashed border-crust bg-apricot p-3 text-sm font-bold">
          Local demo with made-up days. Nothing is saved or sent anywhere.
        </p>
        <section>
          <h1 className="text-2xl font-extrabold">1. Host: when's the hangout?</h1>
          <div className="mt-4">
            <DayStep day={choice.day} pickedDays={choice.pickedDays} today={today} onChange={setChoice} />
          </div>
        </section>
        <section>
          <h2 className="text-2xl font-extrabold">2. Everyone: when are you free?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The hangout is {HANGOUT_MIN} minutes. Draw a block for every stretch you're free.
          </p>
          <div className="mt-4">
            {days.length ? (
              <AvailabilityCalendar
                key={days.join()}
                days={days}
                value={value}
                gap={gap}
                minSlotFor={(date) => (date === today ? todayMin : 0)}
                onChange={setValue}
              />
            ) : (
              <p className="font-bold">Pick at least one day above.</p>
            )}
          </div>
        </section>
        <section>
          <h2 className="text-lg font-extrabold">What would be saved</h2>
          <pre className="mt-2 overflow-x-auto rounded-lg border-2 border-crust bg-cream p-3 text-xs">
            {JSON.stringify(saved, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
