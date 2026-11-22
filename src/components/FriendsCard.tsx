import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PopButton } from "@/components/Field";
import { PaperIcon } from "@/components/PaperIcon";
import { UsersIcon } from "@/components/icons";

type Item = { id: string; username: string | null; kind: "friend" | "incoming" | "outgoing" };
type Res = { ok: boolean; error?: string; result?: string; items?: Item[] };

async function call(p_action: string, args: { p_username?: string; p_id?: string } = {}): Promise<Res> {
  const { data, error } = await supabase.rpc("friend_action", { p_action, ...args });
  if (error) throw error;
  return data as unknown as Res;
}

const ERRORS: Record<string, string> = {
  not_found: "No one has that username.",
  self: "That's you!",
  already_friends: "You're already friends.",
  already_requested: "A request is already pending.",
};

export function FriendsCard() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["friends"], queryFn: () => call("list") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["friends"] });
  const add = useMutation({
    mutationFn: () => call("request", { p_username: name }),
    onSuccess: (r) => {
      setMsg(r.ok ? (r.result === "accepted" ? "You're now friends!" : "Friend request sent.") : ERRORS[r.error ?? ""] ?? "Couldn't send request.");
      if (r.ok) setName("");
      refresh();
    },
    onError: () => setMsg("Something went wrong. Try again."),
  });
  const act = useMutation({ mutationFn: (a: { action: string; id: string }) => call(a.action, { p_id: a.id }), onSuccess: refresh });
  const items = list.data?.items ?? [];
  const group = (k: Item["kind"]) => items.filter((i) => i.kind === k);

  return (
    <section aria-label="Friends list" className="paper rounded-3xl border-2 border-crust bg-cream p-5 shadow-pop">
      <div className="flex items-center gap-3">
        <PaperIcon tone="chartreuse" back="cream" rotate={5} className="h-12 w-12"><UsersIcon className="h-6 w-6" /></PaperIcon>
        <h2 className="text-xl font-extrabold">Friends list</h2>
      </div>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
        <label className="sr-only" htmlFor="friend-username">Friend's username</label>
        <input id="friend-username" value={name} onChange={(e) => { setName(e.target.value); setMsg(null); }} placeholder="Username"
          className="h-12 min-w-0 flex-1 rounded-lg border-2 border-crust bg-offwhite px-3 font-semibold text-crust focus:outline-none focus:ring-2 focus:ring-tangerine" />
        <PopButton type="submit" className="w-auto px-4" disabled={add.isPending || !name.trim()}>Add</PopButton>
      </form>
      {msg && <p role="status" className="mt-2 text-sm font-semibold">{msg}</p>}
      {list.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : (
        <div className="mt-4 space-y-3 text-sm">
          {group("incoming").map((i) => (
            <div key={i.id} className="flex items-center gap-2 rounded-lg border-2 border-crust bg-apricot/40 p-2">
              <span className="flex-1 font-bold">{i.username} wants to be friends</span>
              <button className="rounded-md border-2 border-crust bg-chartreuse px-2 py-1 font-bold" onClick={() => act.mutate({ action: "accept", id: i.id })}>Accept</button>
              <button className="rounded-md border-2 border-crust bg-offwhite px-2 py-1 font-bold" onClick={() => act.mutate({ action: "remove", id: i.id })}>Decline</button>
            </div>
          ))}
          {group("friend").length === 0 && group("incoming").length === 0 && <p className="text-muted-foreground">No friends yet — add one by username.</p>}
          {group("friend").map((i) => (
            <div key={i.id} className="flex items-center justify-between rounded-lg border-2 border-crust bg-offwhite p-2">
              <span className="font-bold">{i.username}</span>
              <button className="text-xs font-bold underline" onClick={() => act.mutate({ action: "remove", id: i.id })}>Remove</button>
            </div>
          ))}
          {group("outgoing").map((i) => (
            <div key={i.id} className="flex items-center justify-between p-1 text-muted-foreground">
              <span>{i.username} · pending</span>
              <button className="text-xs font-bold underline" onClick={() => act.mutate({ action: "remove", id: i.id })}>Cancel</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
