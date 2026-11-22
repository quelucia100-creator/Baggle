import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Users, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PopButton } from "@/components/Field";
import { PaperIcon } from "@/components/PaperIcon";
import { accessParty } from "@/lib/party";
import { accountPreferencesQuery } from "@/lib/account-preferences";

export const Route = createFileRoute("/_authenticated/journey/new")({
  head: () => ({
    meta: [
      { title: "Start a journey — Baggle" },
      { name: "description", content: "Start a new Baggle journey on your own or with one of your groups." },
      { property: "og:title", content: "Start a journey — Baggle" },
      { property: "og:description", content: "Start a journey with your group." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StartJourney,
});

type Group = { id: string; name: string; members: { username: string | null; invited?: boolean }[] };

function StartJourney() {
  const { data: prefs } = useSuspenseQuery(accountPreferencesQuery());
  const groups = useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("group_action", { p_action: "list" });
      if (error) throw error;
      return data as unknown as { groups?: Group[] };
    },
  });
  const [choice, setChoice] = useState<string>("solo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const list = groups.data?.groups ?? [];

  const start = async () => {
    setBusy(true); setError(null);
    try {
      const party = await accessParty("create", "", prefs.preferences?.username ?? "Host");
      if (choice !== "solo") {
        const { data, error } = await supabase.rpc("invite_group_to_journey", { p_group: choice, p_code: party.code });
        if (error || !(data as { ok?: boolean })?.ok) setError("Journey started, but the group couldn't be invited. Share the code instead.");
      }
      await navigate({ to: "/party/$code", params: { code: party.code } });
    } catch {
      setError("Couldn't start the journey. Please try again.");
    } finally { setBusy(false); }
  };

  const option = (id: string, title: string, sub: string, icon: React.ReactNode) => (
    <button key={id} type="button" role="radio" aria-checked={id === "group" ? choice !== "solo" : choice === id} onClick={() => setChoice(id === "group" ? (list[0]?.id ?? "group") : id)}
      className={`paper flex w-full items-center gap-3 rounded-2xl border-2 border-crust p-4 text-left shadow-pop focus:outline-none focus-visible:ring-4 focus-visible:ring-tangerine ${(id === "group" ? choice !== "solo" : choice === id) ? "bg-chartreuse" : "bg-cream"}`}>
      <PaperIcon tone="apricot" back="sage" className="h-11 w-11">{icon}</PaperIcon>
      <span><span className="block font-extrabold">{title}</span><span className="block text-xs text-muted-foreground">{sub}</span></span>
    </button>
  );

  return (
    <main className="paper min-h-dvh bg-offwhite px-5 py-8 text-crust sm:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <Link to="/home" className="text-sm font-bold underline underline-offset-4">← Dashboard</Link>
        <h1 className="mt-4 text-3xl font-extrabold">Start a journey</h1>
        <p className="mt-1 text-sm text-muted-foreground">Who's coming?</p>
        <div role="radiogroup" aria-label="Who's coming" className="mt-6 space-y-3">
          {option("solo", "Invite people later", "Start now and share the party code.", <User className="h-5 w-5" />)}
          {option("group", "Choose group", "Everyone in the group gets an invite to join.", <Users className="h-5 w-5" />)}
        </div>
        {choice !== "solo" && (
          <div role="radiogroup" aria-label="Choose group" className="mt-4 space-y-2 border-l-4 border-crust/30 pl-4">
            {groups.isLoading && <p className="text-sm text-muted-foreground">Loading your groups…</p>}
            {groups.data && list.length === 0 && (
              <p className="text-sm text-muted-foreground">No groups yet. <Link to="/groups" className="font-bold underline">Make one</Link> to invite everyone at once.</p>
            )}
            {list.map((g) => {
              const count = g.members.filter((m) => !m.invited).length;
              return (
                <button key={g.id} type="button" role="radio" aria-checked={choice === g.id} onClick={() => setChoice(g.id)}
                  className={`paper flex w-full items-center justify-between rounded-xl border-2 border-crust px-4 py-3 text-left font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-tangerine ${choice === g.id ? "bg-chartreuse" : "bg-offwhite"}`}>
                  <span>{g.name}</span><span className="text-xs font-semibold text-muted-foreground">{count} {count === 1 ? "person" : "people"}</span>
                </button>
              );
            })}
          </div>
        )}
        {error && <p role="alert" className="mt-4 text-sm font-semibold">{error}</p>}
        <PopButton className="mt-6" onClick={() => void start()} disabled={busy || choice === "group"}>{busy ? "Starting…" : "Start journey"}</PopButton>
      </div>
    </main>
  );
}
