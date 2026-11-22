import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, LockKeyhole } from "lucide-react";
import { PaperIcon } from "@/components/PaperIcon";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { accountAvailabilityQuery, saveAvailability, removeAvailability } from "@/lib/account-availability";

export const Route = createFileRoute("/_authenticated/availability")({
  loader: ({ context }) => context.queryClient.ensureQueryData(accountAvailabilityQuery()),
  head: () => ({ meta: [
    { title: "Your availability — Baggle" },
    { name: "description", content: "Save a private recurring weekly availability schedule in Montréal time, Monday through Sunday." },
    { property: "og:title", content: "Your availability — Baggle" },
    { property: "og:description", content: "Manage your private recurring weekly availability with Baggle." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: AvailabilityPage,
});

function AvailabilityPage() {
  const { data: days } = useSuspenseQuery(accountAvailabilityQuery());
  const queryClient = useQueryClient();
  return <main className="paper min-h-dvh bg-offwhite px-5 py-8 text-crust sm:px-8">
    <div className="mx-auto max-w-xl">
      <Link to="/home" className="mb-7 inline-flex min-h-11 items-center gap-2 rounded-md font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-vista"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
      <div className="mb-3 flex items-center gap-4"><PaperIcon tone="sage" back="chartreuse" className="h-14 w-14"><CalendarDays className="h-7 w-7" /></PaperIcon><h1 className="text-3xl font-extrabold">Availability</h1></div>
      <p className="mb-8 flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="h-4 w-4" />Only you can see these times.</p>
      <AvailabilityEditor days={days} onSave={async (day) => {
        const saved = await saveAvailability(day);
        queryClient.setQueryData(accountAvailabilityQuery().queryKey, [...days.filter((d) => d.weekday !== saved.weekday), saved].sort((a, b) => a.weekday - b.weekday));
      }} onRemove={async (weekday) => {
        await removeAvailability(weekday);
        queryClient.setQueryData(accountAvailabilityQuery().queryKey, days.filter((d) => d.weekday !== weekday));
      }} />
    </div>
  </main>;
}