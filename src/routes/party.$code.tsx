import { createFileRoute, Link, useHydrated } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Copy, Link2, Trash2, Crown } from "lucide-react";
import { toast } from "sonner";
import { PartyHeader } from "@/components/PartyHeader";
import bagel from "@/assets/bagel-single.png.asset.json";
import { Field, PopButton } from "@/components/Field";
import { PaperIcon } from "@/components/PaperIcon";
import { accessParty, canRemoveMember, MAX_PARTY_MEMBERS } from "@/lib/party";
import { PartyPlanningActions } from "@/components/planning/PartyPlanningActions";
import { usePartyWorkflow, workflowReadiness } from "@/components/planning/usePartyWorkflow";
import { supabase } from "@/integrations/supabase/client";
import { PartyInviteQR } from "@/components/PartyInviteQR";
import { hasPendingGroupInvite, sendPendingGroupInvite } from "@/lib/pending-group-invite";
import { PartyControls, usePartyExit } from "@/components/PartyControls";

export const Route = createFileRoute("/party/$code")({
  head: () => ({
    meta: [
      { title: `Party — Baggle` },
      {
        name: "description",
        content: "Your Baggle party: share your code and get your friends together.",
      },
      { property: "og:title", content: "Join your party on Baggle" },
      { property: "og:description", content: "Join your friends and make a plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Party,
});

function Party() {
  const { code } = Route.useParams();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const queryKey = ["party", code];
  const query = useQuery({
    queryKey,
    queryFn: () => accessParty("read", code),
    enabled: hydrated,
    // Invitation visitors have no capability yet. Poll only after membership
    // is confirmed, so failed reads cannot repeatedly replace the join form.
    refetchInterval: (current) => current.state.data ? 3000 : false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const [name, setName] = useState("");
  usePartyExit(code, query.error);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const party = query.isError ? undefined : query.data;
  const error = query.error instanceof Error ? query.error.message : "";
  const joinable = error.includes("Join this party");
  const workflow = usePartyWorkflow(code, hydrated && !!party);
  const readiness = party && workflowReadiness(party, workflow);
  const hostReady = readiness?.hostReady === true;
  const setupPending = !workflow.state.data || (
    workflow.state.data.status === "collecting" &&
    (workflow.days.data?.hostReady === false || (party?.isHost && !readiness?.selfReady))
  );
  const [signedIn, setSignedIn] = useState<boolean>();
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);
  const invitingGroup = useRef(false);
  useEffect(() => {
    if (!party?.isHost || !hostReady || invitingGroup.current || !hasPendingGroupInvite(code))
      return;
    invitingGroup.current = true;
    void sendPendingGroupInvite(code)
      .catch(() => false)
      .then((sent) => {
        invitingGroup.current = false;
        if (sent) toast.success("Your group has been invited.");
        else toast.error("Couldn't invite your group yet. Share the party code instead.");
      });
  }, [party?.isHost, hostReady, code]);

  const copy = async (kind: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(
        kind === "code" ? code : `${window.location.origin}/party/${code}`,
      );
      setCopied(kind);
      toast.success(kind === "code" ? "Party code copied" : "Invite link copied");
    } catch {
      toast.error("Could not copy. You can select and copy the code below.");
    }
  };


  return (
    <div className="paper-sheet min-h-screen bg-offwhite">
      <PartyHeader code={code} party={party} showCode={hostReady} />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-10 sm:py-14">
        <div className="mb-10 flex items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-bold uppercase text-muted-foreground">
              {party?.isHost ? "You're the host" : "Your party"}
            </p>
            <h1 className="text-3xl font-extrabold sm:text-4xl">The crew starts here.</h1>
          </div>
          <img src={bagel.url} alt="" className="hidden w-28 rotate-12 sm:block" />
        </div>
        {party ? (
          <div className="grid gap-10 md:grid-cols-[1fr_1.1fr] md:gap-14">
            {!hostReady ? (
              <section aria-label="Set up the hangout">
                {setupPending && <div className="paper rounded-3xl border-2 border-crust bg-apricot px-5 py-8 text-center shadow-pop-lg">
                  <p className="text-xs font-bold uppercase">First things first</p>
                  <p className="mt-3 font-display text-2xl font-black">
                    {party.isHost ? "Set up the hangout" : "The host is setting up"}
                  </p>
                  <p className="mt-3 text-sm">
                    {party.isHost
                      ? "Pick the day (today or a few days) and answer your questions. Then you can invite the crew."
                      : "You can answer once the host has finished setting up."}
                  </p>
                </div>}
                <PartyPlanningActions party={party} workflow={workflow} />
              </section>
            ) : (
              <section aria-label="Party code">
                <div className="paper rounded-3xl border-2 border-crust bg-chartreuse px-5 py-8 text-center shadow-pop-lg">
                  <p className="text-xs font-bold uppercase">Party code</p>
                  <p className="mt-3 break-all font-display text-4xl font-black sm:text-5xl">
                    {party.code}
                  </p>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <PopButton
                    tone="sage"
                    onClick={() => void copy("code")}
                    className="flex items-center justify-center gap-2 text-sm"
                  >
                    <Copy className="h-4 w-4 shrink-0" />
                    {copied === "code" ? "Copied!" : "Copy code"}
                  </PopButton>
                  <PopButton
                    tone="apricot"
                    onClick={() => void copy("link")}
                    className="flex items-center justify-center gap-2 text-sm"
                  >
                    <Link2 className="h-4 w-4 shrink-0" />
                    {copied === "link" ? "Copied!" : "Copy link"}
                  </PopButton>
                </div>
                <p className="mt-5 text-sm text-muted-foreground">
                  {party.members.length === MAX_PARTY_MEMBERS
                    ? "The whole crew is here — your party is full."
                    : "Send your code to friends and bring the crew together."}
                </p>
                <section aria-label="Event" className="mt-6">
                  <PartyPlanningActions party={party} workflow={workflow} busy={busy} />
                </section>
                <PartyInviteQR code={code} />
              </section>
            )}
            <section aria-label="Party members">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-xl font-extrabold">Who's in?</h2>
                <span className="font-bold">
                  {party.members.length} / {MAX_PARTY_MEMBERS}
                </span>
              </div>
              <ul className="divide-y-2 divide-crust/15 border-y-2 border-crust/15">
                {party.members.map((member, i) => (
                  <li key={member.id} className="flex min-h-20 items-center gap-4 py-4">
                    <PaperIcon
                      tone={i % 2 ? "apricot" : "sage"}
                      back="chartreuse"
                      className="h-10 w-10 shrink-0"
                    >
                      <span className="font-display text-lg font-extrabold">
                        {member.name.slice(0, 1).toUpperCase()}
                      </span>
                    </PaperIcon>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-bold">
                        {member.name}
                        {member.id === party.selfId ? " (you)" : ""}
                      </p>
                      {member.host && (
                        <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                          <Crown className="h-3 w-3" />
                          Host
                        </span>
                      )}
                    </div>
                    {canRemoveMember(party, member.id) && (
                      <PopButton
                        tone="sage"
                        aria-label={`Remove ${member.name}`}
                        title={`Remove ${member.name}`}
                        onClick={() => setRemoving(member.id)}
                        className="!h-9 !w-9 shrink-0 flex items-center justify-center"
                      >
                        <Trash2 className="h-4 w-4" />
                      </PopButton>
                    )}
                  </li>
                ))}
              </ul>
              <PartyControls party={party} />
            </section>
          </div>
        ) : query.isError ? (
          <section className="max-w-md">
            <h2 className="text-xl font-extrabold">
              {joinable ? `Join party ${code}` : "Can't open this party"}
            </h2>
            {joinable && signedIn ? (
              <Link
                to="/journey/join/$code"
                params={{ code }}
                className="mt-6 inline-block font-bold underline underline-offset-4"
              >
                Join with your account
              </Link>
            ) : joinable && signedIn === undefined ? (
              <p role="status">Checking your session?</p>
            ) : joinable ? (
              <form
                className="mt-6 space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    const joined = await accessParty("join", code, name);
                    queryClient.setQueryData(queryKey, joined);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not join party.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Field
                  label="Display name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={30}
                />
                <PopButton disabled={busy || !name.trim()}>
                  {busy ? "Joining…" : "Join party"}
                </PopButton>
              </form>
            ) : (
              <p role="alert" className="mt-3">
                {error}
              </p>
            )}
          </section>
        ) : (
          <p role="status">Opening your party…</p>
        )}
      </main>
      {removing && party && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-crust/40 px-5"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-title"
            className="paper-sheet w-full max-w-sm rounded-3xl border-2 border-crust bg-offwhite p-6 shadow-pop-lg"
          >
            <h2 id="remove-title" className="text-xl font-extrabold">
              Remove {party.members.find((m) => m.id === removing)?.name}?
            </h2>
            <p className="mt-3 text-sm">They will no longer have access to this party.</p>
            <div className="mt-6 flex gap-3">
              <PopButton tone="sage" disabled={busy} onClick={() => setRemoving(null)}>
                Cancel
              </PopButton>
              <PopButton
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const updated = await accessParty("remove", code, "", removing);
                    queryClient.setQueryData(queryKey, updated);
                    setRemoving(null);
                    toast.success("Member removed");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not remove member.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remove
              </PopButton>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
