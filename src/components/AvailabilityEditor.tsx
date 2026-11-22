import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Pencil, Trash2, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PopButton } from "@/components/Field";
import { BusyGrid } from "@/components/planning/v3/BusyGrid";
import { formatDate, formatLongDate, horizonDates, todayIn } from "@/components/planning/v3/time";
import { freeSlotCount, validateAvailability, type AvailabilityDay } from "@/lib/account-availability-model";

export function AvailabilityEditor({ days, onSave, onRemove }: {
  days: AvailabilityDay[];
  onSave: (day: AvailabilityDay) => Promise<void>;
  onRemove: (date: string) => Promise<void>;
}) {
  const [now] = useState(() => Date.now());
  const today = todayIn(now);
  const [draft, setDraft] = useState<AvailabilityDay | null>(null);
  const [history, setHistory] = useState<AvailabilityDay[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const choose = (date: string) => {
    setDraft(days.find((d) => d.date === date) ?? { date, busy: [], confirmed: false });
    setHistory([]); setError(""); setNotice("");
  };
  const update = (next: { busy: number[]; confirmed: boolean }) => {
    if (!draft) return;
    setHistory((previous) => [...previous.slice(-19), draft]);
    setDraft({ date: draft.date, ...next }); setError(""); setNotice("");
  };
  const save = async () => {
    if (!draft || busy) return;
    const validation = validateAvailability(draft, Date.now());
    if (validation) { setError(validation); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await onSave(draft);
      setDraft(null); setHistory([]); setNotice("Availability saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save your availability."); }
    finally { setBusy(false); }
  };
  const remove = async (date: string) => {
    setBusy(true); setError(""); setNotice("");
    try { await onRemove(date); setNotice("Day removed."); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not remove this day."); }
    finally { setBusy(false); }
  };
  return <div>
    {notice && <p role="status" className="mb-5 border-l-4 border-sage bg-sage/30 p-3 font-bold">{notice}</p>}
    {error && <p role="alert" className="mb-5 border-l-4 border-crust bg-apricot p-3 font-bold">{error}</p>}
    {!draft ? <>
      <h2 className="mb-4 text-xl font-extrabold">Which day?</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {horizonDates(today).map((date) => <Button key={date} variant="outline" disabled={busy} onClick={() => choose(date)} className="paper h-auto min-h-16 flex-col gap-1 border-2 border-crust bg-cream py-3 text-crust shadow-pop">
          <span>{formatDate(date)}</span>
          {days.some((d) => d.date === date && d.confirmed) && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3 w-3" />Saved</span>}
        </Button>)}
      </div>
      <section className="mt-10 border-t-2 border-crust/15 pt-6" aria-label="Saved availability">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-extrabold"><CalendarDays className="h-5 w-5" />Your saved days</h2>
        {days.filter((d) => d.date >= today).length === 0 && <p className="text-muted-foreground">No availability saved yet.</p>}
        {days.filter((d) => d.date >= today).map((day) => <div key={day.date} className="flex items-center gap-3 border-b border-crust/15 py-4">
          <div className="min-w-0 flex-1"><p className="font-bold">{formatLongDate(day.date)}</p><p className="text-sm text-muted-foreground">{day.confirmed ? `${freeSlotCount(day, now) / 2} hours free · Montréal` : "Not confirmed"}</p></div>
          <Button variant="outline" size="icon" disabled={busy} aria-label={`Edit ${formatDate(day.date)}`} title="Edit day" onClick={() => choose(day.date)}><Pencil /></Button>
          <Button variant="outline" size="icon" disabled={busy} aria-label={`Remove ${formatDate(day.date)}`} title="Remove day" onClick={() => void remove(day.date)}><Trash2 /></Button>
        </div>)}
      </section>
    </> : <>
      <h2 className="mb-1 text-xl font-extrabold">When are you free?</h2>
      <p className="mb-5 font-bold text-muted-foreground">{formatLongDate(draft.date)} · Montréal time</p>
      <fieldset disabled={busy} className="min-w-0">
        <BusyGrid key={draft.date} date={draft.date} now={now} value={draft} onChange={update} canUndo={history.length > 0} onUndo={() => {
          const previous = history.at(-1); if (!previous) return;
          setDraft(previous); setHistory((v) => v.slice(0, -1)); setError("");
        }} />
        <label className="paper mt-6 flex min-h-12 items-center gap-3 rounded-lg border-2 border-crust bg-sage/30 p-4 font-bold">
          <input type="checkbox" className="h-5 w-5 accent-crust" checked={draft.confirmed} onChange={(e) => update({ busy: draft.busy, confirmed: e.target.checked })} />
          Confirm this day’s availability
        </label>
      </fieldset>
      <div className="sticky bottom-0 mt-6 flex gap-3 border-t-2 border-crust/15 bg-offwhite py-4">
        <Button variant="outline" disabled={busy} className="h-12 border-2 border-crust" onClick={() => { setDraft(null); setError(""); }}><ArrowLeft />Back</Button>
        <PopButton disabled={busy} onClick={() => void save()} className="flex min-w-0 flex-1 items-center justify-center gap-2">{busy ? "Saving…" : "Save availability"}<ArrowRight className="h-4 w-4" /></PopButton>
      </div>
    </>}
  </div>;
}