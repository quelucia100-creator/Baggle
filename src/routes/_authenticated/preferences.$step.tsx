import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, UserRound, CalendarDays, Heart, Utensils, Accessibility, Wine } from "lucide-react";
import logo from "@/assets/baggle-logo.png.asset.json";
import { AuthShell } from "@/components/BagelScene";
import { PaperIcon } from "@/components/PaperIcon";
import { Field } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BirthDatePicker } from "@/components/BirthDatePicker";
import { accountPreferencesQuery, accessibilityChoices, ageFromBirthDate, alcoholChoices, allergyChoices, dietaryChoices, emptyPreferences, firstMissingStep, foodChoices, isStepComplete, preferenceSteps, saveAccountPreferences, stepTitles, tasteChoices, toggleChoice, type AccountPreferences, type PreferenceStep } from "@/lib/account-preferences";

function getStep(value: string): PreferenceStep {
  return preferenceSteps.find((step) => step === value) ?? "username";
}
export const Route = createFileRoute("/_authenticated/preferences/$step")({
  loader: async ({ context, params }) => {
    const result = await context.queryClient.ensureQueryData(accountPreferencesQuery());
    const step = getStep(params.step);
    const missing = firstMissingStep(result.preferences);
    if (step !== params.step || (missing && preferenceSteps.indexOf(step) > preferenceSteps.indexOf(missing))) {
      throw redirect({ to: "/preferences/$step", params: { step: missing ?? "username" }, replace: true });
    }
    return result;
  },
  head: ({ params }) => ({ meta: [
    { title: `${stepTitles[getStep(params.step)]} — Baggle account` },
    { name: "description", content: `Set your ${stepTitles[getStep(params.step)].toLowerCase()} for your Baggle account.` },
    { property: "og:title", content: `${stepTitles[getStep(params.step)]} — Baggle` },
    { property: "og:description", content: "Your private Baggle account preferences." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: PreferencesPage,
});

function PreferencesPage() {
  const { step: param } = Route.useParams();
  const { data } = useSuspenseQuery(accountPreferencesQuery());
  return <PreferenceForm key={param} step={getStep(param)} initial={data.preferences ?? emptyPreferences(data.userId)} />;
}

function PreferenceForm({ step, initial }: { step: PreferenceStep; initial: AccountPreferences }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const index = preferenceSteps.indexOf(step);
  const icons = [UserRound, CalendarDays, Heart, Utensils, Utensils, Accessibility, Wine];
  const Icon = icons[index] ?? UserRound;
  const editing = initial.completed;
  const valid = isStepComplete(step, draft);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError("");
    try {
      const finishing = step === "alcohol";
      const saved = await saveAccountPreferences({ ...draft, completed: editing || (finishing && !firstMissingStep(draft)) });
      queryClient.setQueryData(accountPreferencesQuery().queryKey, { userId: saved.user_id, preferences: saved });
      if (editing) await navigate({ to: "/settings" });
      else if (finishing) await navigate({ to: "/home", replace: true });
      else await navigate({ to: "/preferences/$step", params: { step: preferenceSteps[index + 1] ?? "alcohol" } });
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save your answers."); }
    finally { setBusy(false); }
  };
  const back = async () => {
    if (editing) await navigate({ to: "/settings" });
    else await navigate({ to: "/preferences/$step", params: { step: preferenceSteps[index - 1] ?? "username" } });
  };
  const choices = step === "tastes" ? tasteChoices : step === "dietary" ? dietaryChoices : accessibilityChoices;
  const values = step === "tastes" ? draft.tastes : step === "dietary" ? draft.dietary : draft.accessibility;
  return <AuthShell>
    <img src={logo.url} alt="Baggle" className="mb-7 w-44" />
    <div className="mb-6 flex items-center justify-between gap-3">
      <PaperIcon tone="sage" back="apricot" className="h-14 w-14"><Icon className="h-7 w-7" /></PaperIcon>
      <span className="text-sm font-bold text-muted-foreground">{editing ? "Account preferences" : `${index + 1} / ${preferenceSteps.length}`}</span>
    </div>
    <h1 className="text-3xl font-extrabold">{stepTitles[step]}</h1>
    <p className="mt-2 text-sm font-bold text-muted-foreground">Required</p>
    {!editing && <div aria-label={`Step ${index + 1} of 7`} className="my-6 grid grid-cols-7 gap-2">
      {preferenceSteps.map((s, i) => <span key={s} className={`h-1.5 ${i <= index ? "bg-tangerine" : "bg-crust/20"}`} />)}
    </div>}
    <form onSubmit={save} className="mt-6 space-y-5">
      {step === "username" && <Field label="Username" autoComplete="username" value={draft.username ?? ""} onChange={(e) => { setDraft({ ...draft, username: e.target.value }); setError(""); }} minLength={3} maxLength={30} pattern="[a-zA-Z0-9_]{3,30}" placeholder="sesame_sam" required />}
      {step === "username" && <p className="text-sm text-muted-foreground">3–30 letters, numbers or underscores.</p>}
      {step === "birth-date" && <><BirthDatePicker value={draft.date_of_birth} onChange={(date_of_birth) => setDraft({ ...draft, date_of_birth })} />
        {draft.date_of_birth && <p className="font-bold">Age: {ageFromBirthDate(draft.date_of_birth)}</p>}</>}
      {step === "food" && <>
        <fieldset className="space-y-2"><legend className="mb-3 font-bold">Food preferences</legend>
          {foodChoices.map((choice) => <label key={choice} className={`paper flex min-h-12 cursor-pointer items-center gap-3 rounded-md border-2 border-crust px-4 py-3 ${draft.food_preferences?.includes(choice) ? "bg-sage" : "bg-cream"}`}>
            <Checkbox checked={draft.food_preferences?.includes(choice) ?? false} onCheckedChange={() => setDraft({ ...draft, food_preferences: toggleChoice(draft.food_preferences, choice, "No preference") })} />
            <span className="text-sm font-semibold">{choice}</span>
          </label>)}
        </fieldset>
        <fieldset className="space-y-2"><legend className="mb-3 font-bold">Food allergies</legend>
          {allergyChoices.map((choice) => <label key={choice} className={`paper flex min-h-12 cursor-pointer items-center gap-3 rounded-md border-2 border-crust px-4 py-3 ${draft.food_allergies?.includes(choice) ? "bg-sage" : "bg-cream"}`}>
            <Checkbox checked={draft.food_allergies?.includes(choice) ?? false} onCheckedChange={() => setDraft({ ...draft, food_allergies: toggleChoice(draft.food_allergies, choice) })} />
            <span className="text-sm font-semibold">{choice}</span>
          </label>)}
        </fieldset>
      </>}
      {(step === "tastes" || step === "dietary" || step === "accessibility") && <fieldset className="space-y-2">
        <legend className="sr-only">{stepTitles[step]}</legend>
        {choices.map((choice) => <label key={choice} className={`paper flex min-h-12 cursor-pointer items-center gap-3 rounded-md border-2 border-crust px-4 py-3 ${values?.includes(choice) ? "bg-sage" : "bg-cream"}`}>
          <Checkbox checked={values?.includes(choice) ?? false} onCheckedChange={() => setDraft({ ...draft, [step]: toggleChoice(values, choice) })} />
          <span className="text-sm font-semibold">{choice}</span>
        </label>)}
      </fieldset>}
      {step === "alcohol" && <fieldset className="space-y-3">
        <legend className="sr-only">Alcohol presence</legend>
        {alcoholChoices.map((choice) => <label key={choice.value} className={`paper flex min-h-12 cursor-pointer items-center gap-3 rounded-md border-2 border-crust px-4 py-3 ${draft.alcohol === choice.value ? "bg-sage" : "bg-cream"}`}>
          <input type="radio" name="alcohol" value={choice.value} checked={draft.alcohol === choice.value} onChange={() => setDraft({ ...draft, alcohol: choice.value })} className="h-4 w-4 accent-crust" required />
          <span className="text-sm font-semibold">{choice.label}</span>
        </label>)}
      </fieldset>}
      {error && <p role="alert" className="font-semibold text-crust">{error}</p>}
      <div className="flex items-center justify-between gap-4 pt-3">
        <Button type="button" variant="outline" size="icon" title="Back" aria-label="Back" disabled={busy || (!editing && index === 0)} onClick={() => void back()} className="paper h-12 w-12 border-2 border-crust bg-cream"><ArrowLeft /></Button>
        <Button type="submit" title={editing ? "Save changes" : step === "alcohol" ? "Finish setup" : "Next"} aria-label={editing ? "Save changes" : step === "alcohol" ? "Finish setup" : "Next"} disabled={busy || !valid} className="paper h-12 min-w-16 border-2 border-crust bg-tangerine text-crust shadow-pop pop-press">
          {busy ? <span>Saving…</span> : editing || step === "alcohol" ? <Check /> : <ArrowRight />}
        </Button>
      </div>
    </form>
  </AuthShell>;
}