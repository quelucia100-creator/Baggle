import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { accessParty } from "@/lib/party";
import { accountPreferencesQuery } from "@/lib/account-preferences";

export const Route = createFileRoute("/_authenticated/journey/join/$code")({
  head: () => ({
    meta: [
      { title: "Joining journey — Baggle" },
      { name: "description", content: "Joining your group's Baggle journey." },
      { property: "og:title", content: "Joining journey — Baggle" },
      { property: "og:description", content: "Joining your group's Baggle journey." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JoinJourney,
});

function JoinJourney() {
  const { code } = Route.useParams();
  const { data: prefs } = useSuspenseQuery(accountPreferencesQuery());
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    accessParty("join", code.toUpperCase(), prefs.preferences?.username ?? "Friend")
      .then((p) => navigate({ to: "/party/$code", params: { code: p.code }, replace: true }))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't join this journey."));
  }, [code, prefs, navigate]);
  return (
    <main className="paper grid min-h-dvh place-items-center bg-offwhite px-5 text-crust">
      {error ? (
        <div className="text-center">
          <p role="alert" className="font-bold">{error}</p>
          <Link to="/notifications" className="mt-3 inline-block font-bold underline">Back to notifications</Link>
        </div>
      ) : <p className="font-bold">Joining journey…</p>}
    </main>
  );
}
