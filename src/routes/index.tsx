import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import logo from "@/assets/baggle-logo.png.asset.json";
import { AuthShell } from "@/components/BagelScene";
import { Field, PopButton } from "@/components/Field";
import { makePartyCode, normalizePartyCode } from "@/lib/password";

export const Route = createFileRoute("/")({
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
  const [mode, setMode] = useState<"pick" | "guest">("pick");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const go = (partyCode: string, created: boolean) =>
    navigate({ to: "/party/$code", params: { code: partyCode }, search: { name: name.trim(), created } });

  return (
    <AuthShell>
      <img src={logo.url} alt="Baggle" className="mx-auto mb-4 w-44" />
      <h1 className="text-center text-3xl font-extrabold">Free time? Let's make it a plan.</h1>
      <p className="mt-2 text-center text-muted-foreground">Who's free, what to do, where and when — sorted in minutes.</p>

      {mode === "pick" ? (
        <div className="mt-8 space-y-4">
          <button onClick={() => setMode("guest")} className="block w-full rounded-3xl border-2 border-crust bg-sage p-5 text-left shadow-pop pop-press">
            <span className="font-display text-xl font-extrabold">🎟️ Jump in as a guest</span>
            <span className="mt-1 block text-sm">Enter a party code or start a group. No account needed.</span>
          </button>
          <Link to="/auth" className="block w-full rounded-3xl border-2 border-crust bg-vista p-5 text-left shadow-pop pop-press">
            <span className="font-display text-xl font-extrabold">🥯 Log in or sign up</span>
            <span className="mt-1 block text-sm">Save your crew, interests and availability.</span>
          </Link>
        </div>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            go(normalizePartyCode(code), false);
          }}
        >
          <Field label="Display name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sesame Sam" required maxLength={30} />
          <Field label="Party code" value={code} onChange={(e) => setCode(normalizePartyCode(e.target.value))} placeholder="ABC123" className="tracking-[0.3em]" />
          <PopButton type="submit" disabled={!name.trim() || code.length !== 6}>Join party</PopButton>
          <div className="flex items-center gap-3 text-xs font-bold uppercase text-muted-foreground"><span className="h-0.5 flex-1 bg-crust/20" />or<span className="h-0.5 flex-1 bg-crust/20" /></div>
          <PopButton type="button" tone="chartreuse" disabled={!name.trim()} onClick={() => go(makePartyCode(), true)}>Create a new group</PopButton>
          <button type="button" onClick={() => setMode("pick")} className="w-full text-sm font-semibold underline underline-offset-4">← Back</button>
        </form>
      )}
    </AuthShell>
  );
}
