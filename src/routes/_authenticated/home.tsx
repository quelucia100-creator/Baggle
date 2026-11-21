import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/BagelScene";
import { PopButton } from "@/components/Field";
import { PaperIcon } from "@/components/PaperIcon";
import { BagelIcon } from "@/components/icons";
import { BackLink } from "@/components/BackLink";

export const Route = createFileRoute("/_authenticated/home")({
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
  const [name, setName] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle();
      setName(p?.display_name ?? "");
    });
  }, []);
  return (
    <AuthShell>
      <BackLink />
      <PaperIcon tone="apricot" back="sage" className="h-14 w-14"><BagelIcon className="h-7 w-7" /></PaperIcon>
      <h1 className="mt-5 text-3xl font-extrabold">Hey {name || "there"}</h1>
      <p className="mt-2 text-muted-foreground">You're signed in. Finding who's free and what to do is coming next.</p>
      <PopButton tone="sage" className="mt-8" onClick={async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
        await navigate({ to: "/auth", search: {}, replace: true });
      }}>Log out</PopButton>
    </AuthShell>
  );
}
