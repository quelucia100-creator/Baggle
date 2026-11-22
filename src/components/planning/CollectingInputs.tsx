import { useState } from "react";
import { ArrowRight, Check, LockKeyhole, Settings2 } from "lucide-react";
import { PopButton } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { PaperIcon } from "@/components/PaperIcon";
import type { PartyState } from "@/lib/party";
import type { PlanningConfig, PlanningState } from "@/lib/planning/types";
import { categories } from "./model";
import { privateDraft, type PrivateDraft } from "./wizard-model";
import { ConfigForm, PreferencesForm } from "./PlanningForms";
import type { WizardSubmit } from "./WizardFrame";

export function CollectingInputs({
  party,
  state,
  busy,
  submit,
}: {
  party: PartyState;
  state: PlanningState;
  busy: boolean;
  submit: WizardSubmit;
}) {
  const [view, setView] = useState<"overview" | "private" | "setup">(() =>
    party.isHost || state.selfPreferences ? "overview" : "private",
  );
  const [ownDraft, setOwnDraft] = useState<PrivateDraft>(() => privateDraft(state.selfPreferences));
  const [hostDraft, setHostDraft] = useState<PlanningConfig>(state.config);
  const [success, setSuccess] = useState("");
  const openPrivate = () => {
    setSuccess("");
    setView("private");
  };
  if (view === "private")
    return (
      <PreferencesForm
        preferences={state.selfPreferences}
        seed={ownDraft}
        onDraft={setOwnDraft}
        busy={busy}
        submit={submit}
        onCancel={() => setView("overview")}
        onSaved={() => {
          setSuccess("Your preferences are saved. You're ready!");
          setView("overview");
        }}
      />
    );
  if (view === "setup" && party.isHost)
    return (
      <ConfigForm
        config={hostDraft}
        onDraft={setHostDraft}
        busy={busy}
        submit={submit}
        onCancel={() => setView("overview")}
        onSaved={() => {
          setSuccess("Event details saved for the crew.");
          setView("overview");
        }}
      />
    );
  return (
    <div className="space-y-8">
      {success && (
        <p
          role="status"
          className="paper flex items-center gap-3 border-2 border-crust bg-sage p-4 text-sm font-bold"
        >
          <Check className="h-5 w-5 shrink-0" />
          {success}
        </p>
      )}
      <section aria-label="Shared event details" className="border-b-2 border-crust/15 pb-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold">The hangout</h2>
          {party.isHost && (
            <Button
              variant="outline"
              disabled={busy}
              className="h-11 border-2 bg-cream font-bold"
              onClick={() => {
                setSuccess("");
                setView("setup");
              }}
            >
              <Settings2 aria-hidden="true" />
              Set up event
            </Button>
          )}
        </div>
        <p className="text-lg font-bold">
          {categories.find((category) => category.value === state.config.category)?.label} ·{" "}
          {state.config.areaLabel}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {state.config.date} · {state.config.durationMin} minutes · Montreal
        </p>
      </section>
      <section aria-label="My readiness" className="py-2">
        <PaperIcon tone={state.selfPreferences ? "sage" : "apricot"} className="mb-5 h-12 w-12">
          {state.selfPreferences ? (
            <Check className="h-6 w-6" />
          ) : (
            <LockKeyhole className="h-6 w-6" />
          )}
        </PaperIcon>
        <h2 className="text-2xl font-extrabold">
          {state.selfPreferences ? "You're in. Time for the crew." : "Make room for a little fun."}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {state.selfPreferences
            ? party.isHost
              ? "Your private answers are saved. Find a plan when at least two people are ready."
              : "Your private answers are saved. Waiting for the host to find a plan."
            : "A few private questions, one at a time. Your friends only see when you're ready."}
        </p>
        <PopButton
          tone={state.selfPreferences ? "sage" : "tangerine"}
          disabled={busy}
          className="mt-6 flex items-center justify-center gap-2"
          onClick={openPrivate}
        >
          {state.selfPreferences ? "Edit my private preferences" : "Add my private preferences"}
          <ArrowRight className="h-4 w-4" />
        </PopButton>
      </section>
    </div>
  );
}
