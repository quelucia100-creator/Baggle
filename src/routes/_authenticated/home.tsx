import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PopButton } from "@/components/Field";
import { PaperIcon, type PaperTone } from "@/components/PaperIcon";
import { BagelIcon, ClockIcon, TicketIcon, UsersIcon } from "@/components/icons";
import { Bell, Settings } from "lucide-react";
import { notificationsQuery } from "@/lib/notifications";
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
      { title: "Your dashboard — Baggle" },
      { name: "description", content: "Your Baggle dashboard: past journeys, friends, groups and availability." },
      { property: "og:title", content: "Your dashboard — Baggle" },
      { property: "og:description", content: "Your Baggle dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

type DashboardSection = {
  title: string;
  description: string;
  tone: PaperTone;
  back: PaperTone;
  rotate: number;
  icon: React.ReactNode;
  to?: "/friends" | "/groups";
};

const SECTIONS: DashboardSection[] = [
  {
    title: "Past journeys",
    description: "Your finished trips and hangouts will live here.",
    tone: "apricot",
    back: "sage",
    rotate: -6,
    icon: <TicketIcon className="h-6 w-6" />,
  },
  {
    title: "Friends list",
    to: "/friends",
    description: "Add friends and see who you plan with most.",
    tone: "chartreuse",
    back: "cream",
    rotate: 5,
    icon: <UsersIcon className="h-6 w-6" />,
  },
  {
    title: "Groups",
    to: "/groups",
    description: "Your go-to crews and recent groups will show up here.",
    tone: "vista",
    back: "apricot",
    rotate: -4,
    icon: <BagelIcon className="h-6 w-6" />,
  },
  {
    title: "Availability",
    description: "Set when you're usually free so planning is instant.",
    tone: "sage",
    back: "chartreuse",
    rotate: 6,
    icon: <ClockIcon className="h-6 w-6" />,
  },
];

function SectionCard({ section }: { section: DashboardSection }) {
  return (
    <section aria-label={section.title} className="paper rounded-3xl border-2 border-crust bg-cream p-5 shadow-pop">
      <div className="flex items-center gap-3">
        <PaperIcon tone={section.tone} back={section.back} rotate={section.rotate} className="h-12 w-12">
          {section.icon}
        </PaperIcon>
        <h2 className="text-xl font-extrabold">{section.title}</h2>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{section.description}</p>
      <p className="mt-4 inline-block rounded-full border-2 border-crust bg-offwhite px-3 py-1 text-xs font-bold uppercase tracking-wider text-crust">
        Coming soon
      </p>
    </section>
  );
}

function Home() {
  const { data } = useSuspenseQuery(accountPreferencesQuery());
  const name = data.preferences?.username;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notes = useQuery(notificationsQuery());
  const unread = notes.data?.filter((n) => !n.read).length ?? 0;
  return (
    <main className="paper min-h-dvh bg-offwhite px-5 py-8 text-crust sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center gap-4">
          <PaperIcon tone="apricot" back="sage" className="h-14 w-14">
            <BagelIcon className="h-7 w-7" />
          </PaperIcon>
          <div>
            <h1 className="text-3xl font-extrabold">Hey {name || "there"}</h1>
            <p className="text-sm text-muted-foreground">Your Baggle dashboard</p>
          </div>
          <Link to="/settings" aria-label="Settings" title="Settings" className="ml-auto rounded-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-tangerine">
            <PaperIcon tone="sage" back="cream" rotate={4} className="h-12 w-12"><Settings className="h-6 w-6" /></PaperIcon>
          </Link>
          <Link to="/notifications" title="Notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative rounded-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-tangerine">
            <PaperIcon tone="tangerine" back="cream" rotate={-5} className="h-12 w-12"><Bell className="h-6 w-6" /></PaperIcon>
            {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full border-2 border-crust bg-chartreuse px-1.5 text-xs font-extrabold">{unread}</span>}
          </Link>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            section.to ? (
              <Link key={section.title} to={section.to} className="block rounded-3xl transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-tangerine">
                <section aria-label={section.title} className="paper h-full rounded-3xl border-2 border-crust bg-cream p-5 shadow-pop">
                  <div className="flex items-center gap-3">
                    <PaperIcon tone={section.tone} back={section.back} rotate={section.rotate} className="h-12 w-12">{section.icon}</PaperIcon>
                    <h2 className="text-xl font-extrabold">{section.title}</h2>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{section.description}</p>
                  <p className="mt-4 inline-block rounded-full border-2 border-crust bg-chartreuse px-3 py-1 text-xs font-bold uppercase tracking-wider">Open →</p>
                </section>
              </Link>
            ) : <SectionCard key={section.title} section={section} />
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <PopButton
            tone="sage"
            className="sm:ml-auto sm:w-auto sm:px-6"
            onClick={async () => {
              await queryClient.cancelQueries();
              queryClient.clear();
              await supabase.auth.signOut();
              await navigate({ to: "/auth", search: {}, replace: true });
            }}
          >
            Log out
          </PopButton>
        </div>
      </div>
    </main>
  );
}
