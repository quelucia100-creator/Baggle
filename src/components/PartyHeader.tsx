import { Link } from "@tanstack/react-router";
import { ArrowLeft, Map, Users } from "lucide-react";
import logo from "@/assets/baggle-logo.png.asset.json";
import { PopButton } from "./Field";

export function PartyHeader({ code, map = false, isHost = false, busy = false, onTeam }: { code: string; map?: boolean; isHost?: boolean; busy?: boolean; onTeam?: () => void }) {
  return <header className="paper flex min-h-24 items-center justify-between gap-4 border-b-2 border-crust bg-offwhite px-5 py-3 sm:px-10">
    <Link to="/" aria-label="Baggle home"><img src={logo.url} alt="Baggle" className="w-20 sm:w-28" /></Link>
    <nav aria-label="Party navigation" className="flex flex-wrap items-center justify-end gap-3 sm:gap-6">
      <span className="flex items-center gap-2 text-sm font-bold">{map ? <Map className="h-4 w-4" /> : <Users className="h-4 w-4" />}{map ? "Map" : "Team"}<span className="hidden text-muted-foreground sm:inline">{code}</span></span>
      {map && isHost ? <PopButton tone="sage" disabled={busy} onClick={onTeam} className="!h-10 !w-auto px-4 text-xs sm:text-sm flex items-center gap-2"><ArrowLeft className="h-4 w-4" />Team status</PopButton> : !map ? <Link to="/" className="flex items-center gap-2 text-sm font-bold hover:underline"><ArrowLeft className="h-4 w-4" />Back</Link> : <Link to="/" className="flex items-center gap-2 text-sm font-bold hover:underline"><ArrowLeft className="h-4 w-4" />Back</Link>}
    </nav>
  </header>;
}