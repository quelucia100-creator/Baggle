import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Field, PopButton } from "@/components/Field";
import { type PlanningConfig, type PlanningState } from "@/lib/planning/types";
import { montrealToday, shiftDate } from "@/lib/planning/tz";
import { budgets, categories, validateConfig, validatePreferences, type PlanningCommand } from "./model";

const inputClass = "paper h-12 w-full min-w-0 rounded-lg border-2 border-crust bg-cream px-3 text-crust focus:outline-none focus:ring-4 focus:ring-vista/40";
export function SelectField({ label, children, ...props }: { label: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-crust">{label}</span><select {...props} className={inputClass}>{children}</select></label>;
}

export function ConfigForm({ config, busy, submit }: { config: PlanningConfig; busy: boolean; submit: (command: PlanningCommand) => void }) {
  const [draft, setDraft] = useState(config);
  const [error, setError] = useState("");
  const update = (patch: Partial<PlanningConfig>) => setDraft((prev) => ({ ...prev, ...patch }));
  const today = montrealToday();
  const onSubmit = (event: FormEvent) => {
    event.preventDefault(); setError("");
    try { submit({ action: "configure", config: validateConfig(draft) }); }
    catch (err) { setError(err instanceof Error ? err.message : "Check your event details."); }
  };
  return <form aria-label="Event details" onSubmit={onSubmit} className="space-y-5">
    <fieldset disabled={busy} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Activity category" value={draft.category} onChange={(e) => { const category = categories.find((item) => item.value === e.target.value); if (category) update({ category: category.value }); }}>{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</SelectField>
        <Field label="Date · Montreal" type="date" required min={today} max={shiftDate(today, 14)} value={draft.date} onChange={(e) => update({ date: e.target.value })} />
      </div>
      <Field label="Duration · minutes" type="number" min={30} max={240} step={1} required value={draft.durationMin} onChange={(e) => update({ durationMin: Number(e.target.value) })} />
      <Field label="Meeting area" required maxLength={80} value={draft.areaLabel} onChange={(e) => update({ areaLabel: e.target.value })} />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Area latitude" type="number" min={-90} max={90} step="any" required value={draft.area.lat} onChange={(e) => update({ area: { ...draft.area, lat: Number(e.target.value) } })} />
        <Field label="Area longitude" type="number" min={-180} max={180} step="any" required value={draft.area.lng} onChange={(e) => update({ area: { ...draft.area, lng: Number(e.target.value) } })} />
      </div>
      <p className="text-sm text-muted-foreground">Some categories may not have verified matches yet. No device location is needed.</p>
      <PopButton tone="sage" type="submit">{busy ? "Saving…" : "Save event details"}</PopButton>
    </fieldset>
    {error && <p role="alert" className="text-sm font-semibold">{error}</p>}
  </form>;
}

export function PreferencesForm({ preferences, busy, submit }: { preferences: PlanningState["selfPreferences"]; busy: boolean; submit: (command: PlanningCommand) => void }) {
  const [draft, setDraft] = useState(preferences ?? { budget: 0, freeFrom: "12:00", freeTo: "18:00", maxTravelMin: 30, originLat: null, originLng: null });
  const [origin, setOrigin] = useState({ lat: preferences?.originLat?.toString() ?? "", lng: preferences?.originLng?.toString() ?? "" });
  const [useOrigin, setUseOrigin] = useState(preferences?.originLat != null);
  const [error, setError] = useState("");
  const update = (patch: Partial<typeof draft>) => setDraft((prev) => ({ ...prev, ...patch }));
  return <form aria-label="My private preferences" className="space-y-5" onSubmit={(event) => {
    event.preventDefault(); setError("");
    try {
      if (useOrigin && (!origin.lat.trim() || !origin.lng.trim())) throw new Error("Enter both rough coordinates, or turn off the optional origin.");
      const round = (value: string) => Math.round(Number(value) * 100) / 100;
      submit({ action: "save", preferences: validatePreferences({ ...draft, originLat: useOrigin ? round(origin.lat) : null, originLng: useOrigin ? round(origin.lng) : null }) });
    } catch (err) { setError(err instanceof Error ? err.message : "Check your private answers."); }
  }}>
    <p className="flex items-start gap-2 text-sm text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />Only you can see these answers, not even the host.</p>
    <fieldset disabled={busy} className="space-y-5">
      <SelectField label="My budget" value={draft.budget} onChange={(e) => update({ budget: Number(e.target.value) })}>{budgets.map((label, index) => <option key={index} value={index}>{index} · {label}</option>)}</SelectField>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Free from · Montreal" type="time" required value={draft.freeFrom} onChange={(e) => update({ freeFrom: e.target.value })} />
        <Field label="Free until · Montreal" type="time" required value={draft.freeTo} onChange={(e) => update({ freeTo: e.target.value })} />
      </div>
      <p className="text-sm text-muted-foreground">An end time at or before your start time means the following day.</p>
      <Field label="Max estimated travel · minutes" type="number" min={5} max={90} step={1} required value={draft.maxTravelMin} onChange={(e) => update({ maxTravelMin: Number(e.target.value) })} />
      <p className="text-sm text-muted-foreground">Travel is estimated from the chosen meeting area unless you add a rough starting point.</p>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold"><input type="checkbox" className="h-5 w-5 accent-crust focus-visible:outline-2 focus-visible:outline-vista" checked={useOrigin} onChange={(e) => setUseOrigin(e.target.checked)} />Add my rough starting point (optional)</label>
      {useOrigin && <><div className="grid grid-cols-2 gap-4">
        <Field label="My rough latitude" type="number" min={-90} max={90} step="any" required value={origin.lat} onChange={(e) => setOrigin((prev) => ({ ...prev, lat: e.target.value }))} />
        <Field label="My rough longitude" type="number" min={-180} max={180} step="any" required value={origin.lng} onChange={(e) => setOrigin((prev) => ({ ...prev, lng: e.target.value }))} />
      </div><p className="text-xs text-muted-foreground">Rounded to two decimal places before saving. No location permission is requested.</p></>}
      <PopButton type="submit" className="flex items-center justify-center gap-2">{busy ? "Saving…" : preferences ? "Update my preferences" : "Submit my preferences"}<ArrowRight className="h-4 w-4" /></PopButton>
    </fieldset>
    {error && <p role="alert" className="text-sm font-semibold">{error}</p>}
  </form>;
}