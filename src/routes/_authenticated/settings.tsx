import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import { AuthShell } from "@/components/BagelScene";
import { Button } from "@/components/ui/button";
import { accountPreferencesQuery, saveAccountPreferences, ageFromBirthDate, alcoholChoices, firstMissingStep, preferenceSteps, stepTitles, type AccountPreferences, type PreferenceStep } from "@/lib/account-preferences";

export const Route = createFileRoute("/_authenticated/settings")({
  loader: async ({ context }) => {
    const result = await context.queryClient.fetchQuery(accountPreferencesQuery());
    const missing = firstMissingStep(result.preferences);
    if (missing || !result.preferences?.completed) throw redirect({ to: "/preferences/$step", params: { step: missing ?? "alcohol" }, replace: true });
    return result;
  },
  head: () => ({ meta: [
    { title: "Account preferences — Baggle" }, { name: "description", content: "Review and update your private Baggle account preferences." },
    { property: "og:title", content: "Account preferences — Baggle" }, { property: "og:description", content: "Your personal Baggle preferences." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Settings,
});
function summary(step: PreferenceStep, p: AccountPreferences): string {
  switch (step) {
    case "username": return p.username ?? "";
    case "birth-date": return p.date_of_birth ? `${p.date_of_birth} · Age ${ageFromBirthDate(p.date_of_birth)}` : "";
    case "tastes": return p.tastes?.join(", ") ?? "";
    case "food": return `${p.food_preferences?.join(", ") ?? ""} · Allergies: ${p.food_allergies?.join(", ") ?? ""}`;
    case "dietary": return p.dietary?.join(", ") ?? "";
    case "accessibility": return p.accessibility?.join(", ") ?? "";
    case "alcohol": return alcoholChoices.find((c) => c.value === p.alcohol)?.label ?? "";
  }
}
function Settings() {
  const { data } = useSuspenseQuery(accountPreferencesQuery());
  const p = data.preferences;
  const qc = useQueryClient();
  const privacy = useMutation({
    mutationFn: (is_private: boolean) => saveAccountPreferences({ ...p!, is_private }),
    onSuccess: (saved) => qc.setQueryData(accountPreferencesQuery().queryKey, { ...data, preferences: saved }),
  });
  if (!p) return null;
  return <AuthShell>
    <Button asChild size="icon" variant="outline" className="mb-6 border-2 border-crust"><Link to="/home" aria-label="Back" title="Back"><ArrowLeft /></Link></Button>
    <h1 className="text-3xl font-extrabold">Account preferences</h1>
    <dl className="mt-6 divide-y-2 divide-crust/20">
      {preferenceSteps.map((step) => <div key={step} className="flex items-start justify-between gap-4 py-5">
        <div className="min-w-0"><dt className="font-bold">{stepTitles[step]}</dt><dd className="mt-1 break-words text-sm text-muted-foreground">{summary(step, p)}</dd></div>
        <Button asChild size="icon" variant="outline" className="shrink-0 border-2 border-crust bg-sage"><Link to="/preferences/$step" params={{ step }} aria-label={`Edit ${stepTitles[step]}`} title={`Edit ${stepTitles[step]}`}><Pencil /></Link></Button>
      </div>)}
      <div className="py-5">
        <p id="privacy-label" className="font-bold">Account visibility</p>
        <div role="radiogroup" aria-labelledby="privacy-label" className="mt-3 grid grid-cols-2 gap-2">
          {([[false, "Public", "Anyone can add you to a group straight away."], [true, "Private", "If someone who isn't your friend adds you to a group, you have to accept first."]] as const).map(([value, label, hint]) => (
            <button key={label} type="button" role="radio" aria-checked={p.is_private === value} disabled={privacy.isPending}
              onClick={() => p.is_private !== value && privacy.mutate(value)}
              className={`paper rounded-lg border-2 border-crust p-3 text-left shadow-pop focus:outline-none focus-visible:ring-4 focus-visible:ring-tangerine disabled:opacity-60 ${p.is_private === value ? "bg-chartreuse" : "bg-offwhite"}`}>
              <span className="block font-extrabold">{label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>
        {privacy.isError && <p role="alert" className="mt-2 text-sm font-semibold">Couldn't save. Please try again.</p>}
      </div>
    </dl>
  </AuthShell>;
}