import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { PopButton } from "@/components/Field";
import { readPartyInvitation } from "@/lib/party-invitation";
import { accessParty } from "@/lib/party";
import { supabase } from "@/integrations/supabase/client";
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
  validateSearch: (search: Record<string, unknown>): { notification?: string } =>
    typeof search["notification"] === "string" && /^[0-9a-f-]{36}$/i.test(search["notification"])
      ? { notification: search["notification"] }
      : {},
  component: JoinJourney,
});

function JoinJourney() {
  const { code } = Route.useParams();
  const { notification } = Route.useSearch();
  return <JoinParty key={code} invite={code} notification={notification} />;
}

function JoinParty({
  invite,
  notification,
}: {
  invite: string;
  notification?: string | undefined;
}) {
  const { data: prefs } = useSuspenseQuery(accountPreferencesQuery());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const username = prefs.preferences?.username ?? "Friend";
  const code = readPartyInvitation(invite);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(code ? null : "Enter a valid party code.");
  useEffect(() => {
    if (!code) return;
    let active = true;
    // Cache the in-flight join across remounts. The server also reuses a member's capability.
    queryClient
      .fetchQuery({
        queryKey: ["journey-join", code, username],
        queryFn: () => accessParty("join", code, username),
        gcTime: 0,
        retry: false,
      })
      .then((party) => {
        if (!active) return;
        queryClient.setQueryData(["party", party.code], party);
        if (notification) {
          void (async () => {
            const { error } = await supabase
              .from("notifications")
              .update({ read: true })
              .eq("id", notification);
            if (!error) await queryClient.invalidateQueries({ queryKey: ["notifications"] });
          })();
        }
        void navigate({ to: "/party/$code", params: { code: party.code }, replace: true });
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Couldn't join this journey.");
      });
    return () => {
      active = false;
    };
  }, [code, username, attempt, notification, navigate, queryClient]);
  return (
    <main className="paper grid min-h-dvh place-items-center bg-offwhite px-5 text-crust">
      {error ? (
        <div className="text-center">
          <p role="alert" className="font-bold">
            {error}
          </p>
          {code && (
            <PopButton
              tone="sage"
              className="mt-4"
              onClick={() => {
                setError(null);
                setAttempt(attempt + 1);
              }}
            >
              Try again
            </PopButton>
          )}
          <Link to="/home" className="mt-3 block font-bold underline">
            Back to dashboard
          </Link>
          <Link to="/notifications" className="mt-3 inline-block font-bold underline">
            Back to notifications
          </Link>
        </div>
      ) : (
        <p className="font-bold">Joining journey…</p>
      )}
    </main>
  );
}
