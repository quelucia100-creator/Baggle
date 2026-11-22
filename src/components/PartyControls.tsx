import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { partySocial } from "@/lib/party-social";
import { clearGuestEntry } from "@/lib/guest-entry";
import type { PartyState } from "@/lib/party";

export function usePartyExit(code: string, error?: unknown) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const departing = useRef(false);
  useEffect(() => { departing.current = false; }, [code]);
  const exit = async () => {
    if (departing.current) return;
    departing.current = true;
    clearGuestEntry(code);
    try {
      for (const key of Object.keys(sessionStorage)) if (key.startsWith(`baggle-plan-draft-${code}-`)) sessionStorage.removeItem(key);
    } catch { /* Optional draft storage cannot block leaving. */ }
    const prefixes = ["party", "party-planning", "party-planning-days", "party-social", "party-weather"];
    await client.cancelQueries({ predicate: (query) => prefixes.includes(String(query.queryKey[0])) && query.queryKey[1] === code });
    client.removeQueries({ predicate: (query) => prefixes.includes(String(query.queryKey[0])) && query.queryKey[1] === code });
    const signedIn = await supabase.auth.getSession().then(({ data }) => !!data.session).catch(() => false);
    await navigate({ to: signedIn ? "/home" : "/", search: signedIn ? {} : { guest: true }, replace: true });
  };
  useEffect(() => {
    if (error instanceof Error && error.message.includes("This party has been disbanded")) {
      toast.info("The host closed this party.");
      void exit();
    }
  }, [error]);
  return exit;
}

export function PartyControls({ party }: { party: PartyState }) {
  const client = useQueryClient();
  const exit = usePartyExit(party.code);
  const [signedIn, setSignedIn] = useState(false);
  const [confirm, setConfirm] = useState<"leave" | "disband" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState<string | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const social = useQuery({
    queryKey: ["party-social", party.code, party.selfId], enabled: signedIn, retry: false,
    queryFn: async () => {
      const attached = await partySocial("attach", party.code);
      return attached.ok ? partySocial("list", party.code) : { ok: true, items: [] };
    },
    refetchInterval: 3000,
  });
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (active) setSignedIn(!!data.session?.user); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (confirm) confirmButton.current?.focus(); }, [confirm]);
  const run = async () => {
    if (!confirm || busy) return;
    setBusy(true); setError("");
    try {
      const result = await partySocial(confirm, party.code);
      if (!result.ok) throw new Error("Your change wasn't confirmed. Try again.");
      await exit();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't leave. Try again."); setBusy(false); }
  };
  return (
    <section aria-label="Party connections and membership" className="mt-8 border-t-2 border-crust/20 pt-5">
      {signedIn && (social.data?.items?.length ?? 0) > 0 && <div className="mb-6">
        <h2 className="text-lg font-extrabold">Friends in the crew</h2>
        <ul className="mt-3 divide-y border-crust/20">
          {social.data?.items?.map((member) => <li key={member.memberId} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3">
            <span className="min-w-0 break-words font-bold">{member.username}</span>
            {member.relationship === "friend" || member.relationship === "outgoing" ? <span className="text-sm text-muted-foreground">{member.relationship === "friend" ? "Friends" : "Request sent"}</span> :
              <Button variant="outline" disabled={requesting !== null} className="min-h-11 bg-sage" onClick={async () => {
                setRequesting(member.memberId); setError("");
                try {
                  const result = await partySocial("request", party.code, member.memberId);
                  if (!result.ok && !["already_friends", "already_requested"].includes(result.error ?? "")) throw new Error("Couldn't send this friend request.");
                  if (result.ok) toast.success(result.result === "accepted" ? "You're now friends!" : "Friend request sent.");
                  await social.refetch();
                  void client.invalidateQueries({ queryKey: ["friends"] });
                  void client.invalidateQueries({ queryKey: ["notifications"] });
                } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't send request."); }
                finally { setRequesting(null); }
              }}><UserPlus className="h-4 w-4" />{requesting === member.memberId ? "Sending…" : member.relationship === "incoming" ? "Accept request" : "Add friend"}</Button>}
          </li>)}
        </ul>
      </div>}
      {signedIn && social.isError && <p role="alert" className="mb-3 text-sm">Couldn't check party friends. <Button variant="ghost" onClick={() => void social.refetch()}>Retry</Button></p>}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" className="min-h-12 bg-offwhite" onClick={() => { setError(""); setConfirm("leave"); }}><LogOut className="h-4 w-4" />Leave party</Button>
        {party.isHost && <Button variant="outline" className="min-h-12 bg-apricot" onClick={() => { setError(""); setConfirm("disband"); }}><XCircle className="h-4 w-4" />Disband party</Button>}
      </div>
      {error && !confirm && <p role="alert" className="mt-3 text-sm font-bold">{error}</p>}
      {confirm && <div className="fixed inset-0 z-50 grid place-items-center bg-crust/40 p-5" onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) setConfirm(null);
        if (event.key === "Tab") { event.preventDefault(); const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"); const next = document.activeElement === buttons[0] ? buttons[1] : buttons[0]; next?.focus(); }
      }}>
        <section role="dialog" aria-modal="true" aria-labelledby="party-exit-title" aria-describedby="party-exit-detail" className="paper-sheet w-full max-w-md rounded-lg border-2 border-crust bg-offwhite p-6 shadow-pop">
          <h2 id="party-exit-title" className="text-2xl font-extrabold">{confirm === "disband" ? "Close the whole party?" : "Leave this party?"}</h2>
          <p id="party-exit-detail" className="mt-3 text-sm">{confirm === "disband" ? "Everyone will leave and this code will no longer work. The plan will be cancelled." : party.isHost ? "The next member becomes the host. If you're the last person, the party closes." : "Your shared location will be removed. You can join again with the party code."}</p>
          {error && <p role="alert" className="mt-3 text-sm font-bold">{error}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button ref={confirmButton} variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Stay in party</Button>
            <Button disabled={busy} onClick={() => void run()}>{busy ? "Leaving…" : confirm === "disband" ? "Disband party" : "Leave party"}</Button>
          </div>
        </section>
      </div>}
    </section>
  );
}