import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Pencil, Trash2, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PopButton } from "@/components/Field";
import { BusyGrid } from "@/components/planning/v3/BusyGrid";
import { AVAILABILITY_WEEKDAYS, weekdayLabel, freeSlotCount, validateAvailability, type AvailabilityDay } from "@/lib/account-availability-model";

export function AvailabilityEditor({ days, onSave, onRemove }: {
  days: AvailabilityDay[];
  onSave: (day: AvailabilityDay) => Promise<void>;
  onRemove: (weekday: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AvailabilityDay | null>(null);
  const [drafts, setDrafts] = useState<Record<number, AvailabilityDay>>({});
  const [history, setHistory] = useState<AvailabilityDay[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const choose = (weekday: number) => {
    setDraft(drafts[weekday] ?? days.find((d) => d.weekday === weekday) ?? { weekday, busy: [], confirmed: false });
    setHistory([]); setError(""); setNotice("");
  };
  const update = (next: { busy: number[]; confirmed: boolean }) => {
    if (!draft) return;
    setHistory((previous) => [...previous.slice(-19), draft]);
    const updated = { weekday: draft.weekday, ...next };
    setDraft(updated); setDrafts((v) => ({ ...v, [draft.weekday]: updated })); setError(""); setNotice("");
  };
  const save = async () => {
    if (!draft || busy) return;
    const validation = validateAvailability(draft);
    if (validation) { setError(validation); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await onSave(draft);
      setDraft(null); setHistory([]); setNotice("Availability saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save your availability."); }
    finally { setBusy(false); }
  };
  const remove = async (weekday: number) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await onRemove(weekday);
      setDrafts((v) => { const next = { ...v }; delete next[weekday]; return next; });
      setNotice("Day removed.");
    }
    catch (err) { setError(err instanceof Error ? err.message : "Could not remove this day."); }
    finally { setBusy(false); }
  };
  return <div>
    {notice && <p role="status" className="mb-5 border-l-4 border-sage bg-sage/30 p-3 font-bold">{notice}</p>}
    {error && <p role="alert" className="mb-5 border-l-4 border-crust bg-apricot p-3 font-bold">{error}</p>}
    {!draft ? <>
      <h2 className="mb-4 text-xl font-extrabold">Which day of the week?</h2>
      <p className="mb-5 text-sm text-muted-foreground">Your usual week · Repeats until you change it.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {AVAILABILITY_WEEKDAYS.map((label, index) => <Button key={label} variant="outline" aria-label={label} disabled={busy} onClick={() => choose(index + 1)} className="paper h-auto min-h-16 flex-col gap-1 border-2 border-crust bg-cream py-3 text-crust shadow-pop">
          <span>{label}</span>
          {days.some((d) => d.weekday === index + 1 && d.confirmed) && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3 w-3" />Saved</span>}
        </Button>)}
      </div>
      <section className="mt-10 border-t-2 border-crust/15 pt-6" aria-label="Saved availability">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-extrabold"><CalendarDays className="h-5 w-5" />Your saved days</h2>
        {days.length === 0 && <p className="text-muted-foreground">No availability saved yet.</p>}
        {days.map((day) => <div key={day.weekday} className="flex items-center gap-3 border-b border-crust/15 py-4">
          <div className="min-w-0 flex-1"><p className="font-bold">Every {weekdayLabel(day.weekday)}</p><p className="text-sm text-muted-foreground">{day.confirmed ? `${freeSlotCount(day) / 2} hours free · Includes next morning · Montréal` : "Not confirmed"}</p></div>
          <Button variant="outline" size="icon" disabled={busy} aria-label={`Edit ${weekdayLabel(day.weekday)}`} title="Edit day" onClick={() => choose(day.weekday)}><Pencil /></Button>
          <Button variant="outline" size="icon" disabled={busy} aria-label={`Remove ${weekdayLabel(day.weekday)}`} title="Remove day" onClick={() => void remove(day.weekday)}><Trash2 /></Button>
        </div>)}
      </section>
    </> : <>
      <h2 className="mb-1 text-xl font-extrabold">When are you free?</h2>
      <p className="mb-5 font-bold text-muted-foreground">Every {weekdayLabel(draft.weekday)} · Montréal time</p>
      <fieldset disabled={busy} className="min-w-0">
        <BusyGrid key={draft.weekday} recurringWeekday={weekdayLabel(draft.weekday)} value={draft} onChange={update} canUndo={history.length > 0} onUndo={() => {
          const previous = history.at(-1); if (!previous) return;
          setDraft(previous); setDrafts((v) => ({ ...v, [previous.weekday]: previous })); setHistory((v) => v.slice(0, -1)); setError("");
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