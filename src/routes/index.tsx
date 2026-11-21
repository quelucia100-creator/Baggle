import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import logo from "@/assets/baggle-logo.png.asset.json";
import { AuthShell } from "@/components/BagelScene";
import { Field, PopButton } from "@/components/Field";
import { PaperIcon } from "@/components/PaperIcon";
import { BagelIcon, TicketIcon } from "@/components/icons";
import { normalizePartyCode } from "@/lib/password";
import { accessParty } from "@/lib/party";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { guest?: boolean } =>
    search["guest"] === true || search["guest"] === "true" ? { guest: true } : {},
  head: () => ({
    meta: [
      { title: "Baggle — turn free time into plans with friends" },
      { name: "description", content: "See who's free, pick what to do, and lock in where and when — in minutes, not group-chat hours." },
      { property: "og:title", content: "Baggle — plans with friends, fast" },
      { property: "og:description", content: "See who's free, pick what to do, and lock in where and when." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const { guest } = Route.useSearch();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const go = async (created: boolean) => {
    setBusy(true);
    try {
      const party = await accessParty(created ? "create" : "join", normalizePartyCode(code), name.trim());
      await navigate({ to: "/party/$code", params: { code: party.code } });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not open party."); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <img src={logo.url} alt="Baggle" className="mx-auto mb-4 w-44" />
      <h1 className="text-center text-3xl font-extrabold">Free time? Let's make it a plan.</h1>
      <p className="mt-2 text-center text-muted-foreground">Who's free, what to do, where and when, all sorted in minutes.</p>

      {!guest ? (
        <div className="mt-8 space-y-4">
          <Link to="/" search={{ guest: true }} className="paper flex w-full items-center gap-4 rounded-3xl border-2 border-crust bg-sage p-5 text-left shadow-pop pop-press">
            <PaperIcon tone="apricot" back="chartreuse" className="h-14 w-14"><TicketIcon className="h-7 w-7" /></PaperIcon>
            <span>
              <span className="block font-display text-xl font-extrabold">Jump in as a guest</span>
              <span className="mt-1 block text-sm">Enter a party code or start a group. No account needed.</span>
            </span>
          </Link>
          <Link to="/auth" className="paper flex w-full items-center gap-4 rounded-3xl border-2 border-crust bg-vista p-5 text-left shadow-pop pop-press">
            <PaperIcon tone="chartreuse" back="apricot" rotate={5} className="h-14 w-14"><BagelIcon className="h-7 w-7" /></PaperIcon>
            <span>
              <span className="block font-display text-xl font-extrabold">Log in or sign up</span>
              <span className="mt-1 block text-sm">Save your crew, interests and availability.</span>
            </span>
          </Link>
        </div>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void go(false);
          }}
        >
          <Field label="Display name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sesame Sam" required maxLength={30} />
          <Field label="Party code" value={code} onChange={(e) => setCode(normalizePartyCode(e.target.value))} placeholder="ABC123" className="tracking-[0.3em]" />
          <PopButton type="submit" disabled={busy || !name.trim() || code.length !== 6}>{busy ? "One sec…" : "Join party"}</PopButton>
          <div className="flex items-center gap-3 text-xs font-bold uppercase text-muted-foreground"><span className="h-0.5 flex-1 bg-crust/20" />or<span className="h-0.5 flex-1 bg-crust/20" /></div>
          <PopButton type="button" tone="chartreuse" disabled={busy || !name.trim()} onClick={() => void go(true)}>Create a new group</PopButton>
          <Link to="/" search={{}} className="block w-full text-center text-sm font-semibold underline underline-offset-4">← Back</Link>
        </form>
      )}
    </AuthShell>
  );
}
