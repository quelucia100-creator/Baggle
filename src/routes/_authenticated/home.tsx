import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/BagelScene";
import { PopButton } from "@/components/Field";
import { PaperIcon } from "@/components/PaperIcon";
import { BagelIcon } from "@/components/icons";
import { BackLink } from "@/components/BackLink";
import { accountPreferencesQuery, firstMissingStep } from "@/lib/account-preferences";

export const Route = createFileRoute("/_authenticated/home")({
  loader: async ({ context }) => {
    const result = await context.queryClient.fetchQuery(accountPreferencesQuery());
    const missing = firstMissingStep(result.preferences);
    if (missing || !result.preferences?.completed) throw redirect({ to: "/preferences/$step", params: { step: missing ?? "alcohol" }, replace: true });
    return result;
  },
  head: () => ({
    meta: [
      { title: "Your plans — Baggle" },
      { name: "description", content: "Your Baggle home: friends, plans and what's on." },
      { property: "og:title", content: "Your plans — Baggle" },
      { property: "og:description", content: "Your Baggle home." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function Home() {
  const { data } = useSuspenseQuery(accountPreferencesQuery());
  const name = data.preferences?.username;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <AuthShell>
      <BackLink />
      <PaperIcon tone="apricot" back="sage" className="h-14 w-14"><BagelIcon className="h-7 w-7" /></PaperIcon>
      <h1 className="mt-5 text-3xl font-extrabold">Hey {name || "there"}</h1>
      <p className="mt-2 text-muted-foreground">You're signed in. Finding who's free and what to do is coming next.</p>
      <Link to="/settings" className="mt-6 block font-bold underline underline-offset-4">Account preferences</Link>
      <PopButton tone="sage" className="mt-8" onClick={async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
        await navigate({ to: "/auth", search: {}, replace: true });
      }}>Log out</PopButton>
    </AuthShell>
  );
}
