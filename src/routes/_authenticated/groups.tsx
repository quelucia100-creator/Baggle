import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PopButton } from "@/components/Field";
import { PaperIcon } from "@/components/PaperIcon";
import { BagelIcon } from "@/components/icons";

export const Route = createFileRoute("/_authenticated/groups")({
  head: () => ({
    meta: [
      { title: "Groups — Baggle" },
      { name: "description", content: "Create groups, add friends and see your recent groups on Baggle." },
      { property: "og:title", content: "Groups — Baggle" },
      { property: "og:description", content: "Create groups and add friends on Baggle." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Groups,
});

type Member = { username: string | null; is_owner: boolean; is_me: boolean; invited?: boolean };
type Invite = { id: string; name: string; owner: string | null };
type Group = { id: string; name: string; is_owner: boolean; updated_at: string; members: Member[] };
type Res = { ok: boolean; error?: string; id?: string; groups?: Group[]; invites?: Invite[]; result?: string };

async function call(p_action: string, args: { p_group?: string; p_name?: string; p_username?: string } = {}): Promise<Res> {
  const { data, error } = await supabase.rpc("group_action", { p_action, ...args });
  if (error) throw error;
  return data as unknown as Res;
}

const ERRORS: Record<string, string> = {
  not_found: "No one has that username.",
  already_member: "They're already in this group.",
  full: "Groups can have up to 10 people.",
  bad_name: "Give the group a name (up to 40 characters).",
  not_allowed: "Only the group creator can do that.",
};
const errText = (r: Res) => ERRORS[r.error ?? ""] ?? "Something went wrong.";
const inputCls = "h-12 min-w-0 flex-1 rounded-lg border-2 border-crust bg-offwhite px-3 font-semibold text-crust focus:outline-none focus:ring-2 focus:ring-tangerine";

function Groups() {
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => call("list") });
  const friends = useQuery({
    queryKey: ["friends"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("friend_action", { p_action: "list" });
      if (error) throw error;
      return data as unknown as { items?: { username: string | null; kind: string }[] };
    },
  });
  const friendNames = (friends.data?.items ?? []).filter((f) => f.kind === "friend" && f.username).map((f) => f.username as string);
  const refresh = () => qc.invalidateQueries({ queryKey: ["groups"] });
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => call("create", { p_name: name }),
    onSuccess: (r) => { setMsg(r.ok ? "Group created." : errText(r)); if (r.ok) setName(""); refresh(); },
    onError: () => setMsg("Something went wrong."),
  });
  const list = groups.data?.groups ?? [];
  const invites = groups.data?.invites ?? [];
  const respond = useMutation({ mutationFn: (a: { action: string; id: string }) => call(a.action, { p_group: a.id }), onSuccess: refresh });

  return (
    <main className="paper min-h-dvh bg-offwhite px-5 py-8 text-crust sm:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <Link to="/home" className="text-sm font-bold underline underline-offset-4">← Dashboard</Link>
        <div className="mt-4 flex items-center gap-3">
          <PaperIcon tone="vista" back="apricot" rotate={-4} className="h-12 w-12"><BagelIcon className="h-6 w-6" /></PaperIcon>
          <h1 className="text-3xl font-extrabold">Groups</h1>
        </div>

        <form className="paper mt-6 rounded-3xl border-2 border-crust bg-cream p-5 shadow-pop" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
          <label htmlFor="group-name" className="font-extrabold">New group</label>
          <div className="mt-2 flex gap-2">
            <input id="group-name" maxLength={40} value={name} onChange={(e) => { setName(e.target.value); setMsg(null); }} placeholder="e.g. Study crew" className={inputCls} />
            <PopButton type="submit" className="!w-28 shrink-0" disabled={create.isPending || !name.trim()}>Create</PopButton>
          </div>
          {msg && <p role="status" className="mt-2 text-sm font-semibold">{msg}</p>}
        </form>

        {invites.length > 0 && (
          <section aria-label="Group invites" className="mt-8">
            <h2 className="text-xl font-extrabold">Group invites</h2>
            <div className="mt-3 space-y-2">
              {invites.map((i) => (
                <div key={i.id} className="paper flex flex-wrap items-center gap-2 rounded-2xl border-2 border-crust bg-apricot p-3 shadow-pop">
                  <span className="flex-1 font-bold">{i.owner ?? "Someone"} invited you to “{i.name}”</span>
                  <button className="rounded-md border-2 border-crust bg-chartreuse px-3 py-1 font-bold" disabled={respond.isPending} onClick={() => respond.mutate({ action: "accept_invite", id: i.id })}>Join</button>
                  <button className="rounded-md border-2 border-crust bg-offwhite px-3 py-1 font-bold" disabled={respond.isPending} onClick={() => respond.mutate({ action: "decline_invite", id: i.id })}>Decline</button>
                </div>
              ))}
            </div>
          </section>
        )}

        <h2 className="mt-8 text-xl font-extrabold">Recent groups</h2>
        <div className="mt-3 space-y-4">
          {groups.isLoading && <p className="text-muted-foreground">Loading…</p>}
          {groups.isError && <p role="alert">Couldn't load groups. Try again soon.</p>}
          {groups.data && list.length === 0 && <p className="text-muted-foreground">No groups yet — create one above.</p>}
          {list.map((g) => <GroupCard key={g.id} group={g} friendNames={friendNames} onChange={refresh} />)}
        </div>
      </div>
    </main>
  );
}

function GroupCard({ group, friendNames, onChange }: { group: Group; friendNames: string[]; onChange: () => void }) {
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const inGroup = new Set(group.members.map((m) => m.username?.toLowerCase()));
  const options = friendNames.filter((n) => !inGroup.has(n.toLowerCase()));
  const act = useMutation({
    mutationFn: (a: { action: string; username?: string }) => call(a.action, { p_group: group.id, ...(a.username ? { p_username: a.username } : {}) }),
    onSuccess: (r, a) => { setMsg(r.ok ? (a.action === "add" ? (r.result === "invited" ? "Invite sent — they need to accept." : "Added!") : null) : errText(r)); if (r.ok && a.action === "add") setUsername(""); onChange(); },
    onError: () => setMsg("Something went wrong."),
  });
  const listId = `friends-${group.id}`;

  return (
    <section aria-label={group.name} className="paper rounded-3xl border-2 border-crust bg-cream p-5 shadow-pop">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h3 className="text-lg font-extrabold">{group.name}</h3>
          <p className="text-xs text-muted-foreground">{group.members.filter((m) => !m.invited).length} {group.members.filter((m) => !m.invited).length === 1 ? "person" : "people"} · updated {new Date(group.updated_at).toLocaleDateString()}</p>
        </div>
        {group.is_owner && (
          <button className="text-xs font-bold underline" onClick={() => { if (confirm(`Delete "${group.name}"?`)) act.mutate({ action: "delete" }); }}>Delete</button>
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {group.members.map((m, i) => (
          <li key={`${m.username}-${i}`} className="flex items-center gap-1 rounded-full border-2 border-crust bg-offwhite px-3 py-1 text-sm font-bold">
            {m.username ?? "Someone"}{m.is_me && " (you)"}{m.invited && <span className="text-xs font-semibold text-muted-foreground"> · invited</span>}{m.is_owner && <span className="text-xs font-semibold text-muted-foreground"> · creator</span>}
            {group.is_owner && !m.is_me && m.username && (
              <button aria-label={`Remove ${m.username}`} className="ml-1 font-extrabold" onClick={() => act.mutate({ action: "remove", username: m.username as string })}>×</button>
            )}
          </li>
        ))}
      </ul>
      {group.is_owner && (
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (username.trim()) act.mutate({ action: "add", username }); }}>
          <label className="sr-only" htmlFor={`add-${group.id}`}>Add a friend to {group.name}</label>
          <input id={`add-${group.id}`} list={listId} value={username} onChange={(e) => { setUsername(e.target.value); setMsg(null); }} placeholder="Add by username" className={inputCls} />
          <datalist id={listId}>{options.map((n) => <option key={n} value={n} />)}</datalist>
          <PopButton type="submit" tone="chartreuse" className="!w-24 shrink-0" disabled={act.isPending || !username.trim()}>Add</PopButton>
        </form>
      )}
      {msg && <p role="status" className="mt-2 text-sm font-semibold">{msg}</p>}
    </section>
  );
}
