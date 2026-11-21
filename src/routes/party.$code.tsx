import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/BagelScene";
import { PaperIcon } from "@/components/PaperIcon";
import { PinIcon } from "@/components/icons";

type Search = { name?: string; created?: boolean };

export const Route = createFileRoute("/party/$code")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    name: typeof s["name"] === "string" ? s["name"] : "",
    created: s["created"] === true || s["created"] === "true",
  }),
  head: ({ params }) => ({
    meta: [
      { title: `Party ${params.code} — Baggle` },
      { name: "description", content: "Join your friends' Baggle party and plan something together." },
      { property: "og:title", content: `Join party ${params.code} on Baggle` },
      { property: "og:description", content: "Join your friends and make a plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Party,
});

function Party() {
  const { code } = Route.useParams();
  const { name, created } = Route.useSearch();
  return (
    <AuthShell>
      <PaperIcon tone="vista" back="chartreuse" className="h-14 w-14"><PinIcon className="h-7 w-7" /></PaperIcon>
      <p className="mt-5 text-sm font-bold uppercase tracking-wider text-muted-foreground">{created ? "Group created" : "Joined party"}</p>
      <h1 className="mt-2 text-3xl font-extrabold">Hey {name || "friend"}</h1>
      <div className="paper mt-6 rounded-3xl border-2 border-crust bg-chartreuse p-6 text-center shadow-pop-lg">
        <p className="text-xs font-bold uppercase">Party code</p>
        <p className="font-display text-5xl font-black tracking-[0.2em]">{code}</p>
      </div>
      <p className="mt-6 text-muted-foreground">{created ? "Share this code with friends so they can hop in." : "You're in! Planning tools are coming next."}</p>
      <Link to="/" className="mt-6 inline-block text-sm font-semibold underline underline-offset-4">← Back to start</Link>
    </AuthShell>
  );
}
