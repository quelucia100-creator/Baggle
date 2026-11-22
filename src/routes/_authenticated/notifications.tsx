import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PaperIcon } from "@/components/PaperIcon";
import { notificationsQuery, notificationText } from "@/lib/notifications";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Baggle" },
      { name: "description", content: "Friend requests and updates from your Baggle crew." },
      { property: "og:title", content: "Notifications — Baggle" },
      { property: "og:description", content: "Friend requests and updates from your Baggle crew." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Notifications,
});

function Notifications() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery(notificationsQuery());
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const markAll = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("notifications").update({ read: true }).eq("read", false); if (error) throw error; },
    onSuccess: refresh,
  });
  const markOne = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id); if (error) throw error; },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("notifications").delete().eq("id", id); if (error) throw error; },
    onSuccess: refresh,
  });
  const unread = data?.filter((n) => !n.read).length ?? 0;

  return (
    <main className="paper min-h-dvh bg-offwhite px-5 py-8 text-crust sm:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <Link to="/home" className="text-sm font-bold underline underline-offset-4">← Dashboard</Link>
        <div className="mt-4 flex items-center gap-3">
          <PaperIcon tone="tangerine" back="cream" rotate={-5} className="h-12 w-12"><Bell className="h-6 w-6" /></PaperIcon>
          <h1 className="text-3xl font-extrabold">Notifications</h1>
          {unread > 0 && (
            <button className="ml-auto text-sm font-bold underline" onClick={() => markAll.mutate()} disabled={markAll.isPending}>Mark all read</button>
          )}
        </div>
        <div className="mt-6 space-y-3">
          {isLoading && <p className="text-muted-foreground">Loading…</p>}
          {isError && <p role="alert">Couldn't load notifications. Try again soon.</p>}
          {data && data.length === 0 && <p className="paper rounded-2xl border-2 border-crust bg-cream p-5 text-muted-foreground">You're all caught up.</p>}
          {data?.map((n) => (
            <div key={n.id} className={`paper flex items-start gap-3 rounded-2xl border-2 border-crust p-4 shadow-pop ${n.read ? "bg-cream" : "bg-apricot"}`}>
              {!n.read && <span aria-label="Unread" className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-tangerine border border-crust" />}
              <div className="flex-1">
                <p className="font-bold">{notificationText(n)}</p>
                <p className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
                {n.kind === "friend_request" && <Link to="/friends" className="text-sm font-bold underline">Respond on your friends page</Link>}
                {n.kind === "group_invite" && <Link to="/groups" className="text-sm font-bold underline">Respond on your groups page</Link>}
                {n.kind === "journey_invite" && n.detail && <Link to="/journey/join/$code" params={{ code: n.detail }} onClick={() => !n.read && markOne.mutate(n.id)} className="text-sm font-bold underline">Join journey</Link>}
              </div>
              <div className="flex flex-col items-end gap-1 text-xs font-bold">
                {!n.read && <button className="underline" onClick={() => markOne.mutate(n.id)}>Mark read</button>}
                <button className="underline" onClick={() => remove.mutate(n.id)}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
