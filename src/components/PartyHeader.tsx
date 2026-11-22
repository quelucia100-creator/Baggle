import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Map, Users, CalendarDays } from "lucide-react";
import logo from "@/assets/baggle-logo.png.asset.json";
import { PopButton } from "./Field";
import type { PartyState } from "@/lib/party";
import { rememberGuestEntry } from "@/lib/guest-entry";

export function PartyHeader({ code, party, map = false, plan = false, busy = false, showCode = false, onTeam }: { code: string; party?: PartyState | undefined; map?: boolean; plan?: boolean; busy?: boolean; showCode?: boolean; onTeam?: () => void }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session)); }, []);
  const name = party?.code === code ? party.members.find((member) => member.id === party.selfId)?.name : undefined;
  useEffect(() => { if (name) rememberGuestEntry({ code, name }); }, [code, name]);
  const home = signedIn ? "/home" : "/";
  return <header className="paper flex min-h-24 items-center justify-between gap-4 border-b-2 border-crust bg-offwhite px-5 py-3 sm:px-10">
    <Link to={home} search={signedIn ? {} : { guest: true }} aria-label={signedIn ? "Dashboard" : "Baggle home"}><img src={logo.url} alt="Baggle" className="w-20 sm:w-28" /></Link>
    <nav aria-label="Party navigation" className="flex flex-wrap items-center justify-end gap-3 sm:gap-6">
      <span className="flex items-center gap-2 text-sm font-bold">{plan ? <CalendarDays className="h-4 w-4" /> : map ? <Map className="h-4 w-4" /> : <Users className="h-4 w-4" />}{plan ? "Event" : map ? "Map" : "Team"}{showCode && <span className="hidden text-muted-foreground sm:inline">{code}</span>}</span>
      {map || plan ? <PopButton tone="sage" disabled={busy} onClick={onTeam} className="!h-10 !w-auto px-4 text-xs sm:text-sm flex items-center gap-2"><ArrowLeft className="h-4 w-4" />Team status</PopButton> : <Link to={home} search={signedIn ? {} : { guest: true }} className="flex items-center gap-2 text-sm font-bold hover:underline"><ArrowLeft className="h-4 w-4" />{signedIn ? "Dashboard" : "Back"}</Link>}
    </nav>
  </header>;
}