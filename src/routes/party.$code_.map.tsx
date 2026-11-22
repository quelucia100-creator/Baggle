import { createFileRoute, useHydrated, useNavigate, ClientOnly } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useRef } from "react";
import { LocateFixed, RefreshCw, CloudSun, Navigation } from "lucide-react";
import { toast } from "sonner";
import { PartyHeader } from "@/components/PartyHeader";
import { JourneyMap } from "@/components/JourneyMap";
import { PopButton } from "@/components/Field";
import { PaperIcon } from "@/components/PaperIcon";
import { accessParty, membershipToken, type PartyAction } from "@/lib/party";
import { getPartyWeather } from "@/lib/weather.functions";
import { HangoutPanel } from "@/components/planning/HangoutPanel";
import { usePartyWorkflow, workflowReadiness } from "@/components/planning/usePartyWorkflow";

export const Route = createFileRoute("/party/$code_/map")({
  head: () => ({ meta: [
    { title: `Journey map — Baggle` },
    { name: "description", content: "Your crew's shared locations, local weather and decided hangout on Baggle." },
    { property: "og:title", content: "Your crew's journey — Baggle" },
    { property: "og:description", content: "Bring your friends together with a shared hangout map." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: MapPage,
});

const ignorePick = () => {};

function MapPage() {
  const { code } = Route.useParams();
  const hydrated = useHydrated();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryKey = ["party", code];
  const query = useQuery({ queryKey, queryFn: () => accessParty("read", code), enabled: hydrated, refetchInterval: 3000, retry: false });
  const party = query.isError ? undefined : query.data;
  const workflow = usePartyWorkflow(code, hydrated && !!party);
  const hostReady = party ? workflowReadiness(party, workflow).hostReady : false;
  const [busy, setBusy] = useState(false);
  const [locationError, setLocationError] = useState("");
  const weatherFn = useServerFn(getPartyWeather);
  const hasLocation = !!(party?.hangout || party?.members.some((member) => member.location));
  const weather = useQuery({ queryKey: ["party-weather", code], queryFn: () => weatherFn({ data: { code, token: membershipToken() } }), enabled: hydrated && hasLocation, retry: false, staleTime: 600000 });
  const returnToTeam = party && (!party.started || party.view === "team");
  useEffect(() => {
    if (returnToTeam) void navigate({ to: "/party/$code", params: { code }, replace: true });
  }, [returnToTeam, navigate, code]);
  // Hangouts now come from the planning wizard, so the map no longer accepts hand-dropped pins.
  const mutate = async (action: PartyAction, name = "", coords?: { lat: number; lng: number }) => {
    setBusy(true);
    try {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, await accessParty(action, code, name, undefined, coords));
      return true;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update party."); return false; }
    finally { setBusy(false); }
  };
  const refreshLocation = () => {
    setLocationError("");
    if (!navigator.geolocation) { setLocationError("Your browser does not support location sharing."); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      await mutate("location", "", { lat: position.coords.latitude, lng: position.coords.longitude });
    }, (error) => {
      setBusy(false);
      setLocationError(error.code === 1 ? "Location permission was denied. You can still view the map without sharing." : "Could not find your location. Please try again.");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };
  const self = party?.members.find((member) => member.id === party.selfId);
  const autoLocated = useRef(false);
  useEffect(() => {
    if (!party || autoLocated.current) return;
    autoLocated.current = true;
    if (!self?.location) refreshLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party]);

  return <div className="paper-sheet min-h-screen bg-offwhite">
    <PartyHeader code={code} party={party} map showCode={hostReady} busy={busy} onTeam={() => void mutate("team")} />
    {!party ? <main className="mx-auto max-w-4xl px-6 py-12"><h1 className="text-2xl font-extrabold">Your journey</h1><p className="mt-4" role="status">{query.error instanceof Error ? query.error.message : "Opening your map…"}</p></main> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-crust/20 px-5 py-5 sm:px-10"><div><h1 className="text-2xl font-extrabold">Where are we heading?</h1><p className="mt-1 text-sm text-muted-foreground">{party.members.length} friends · Exact shared locations</p></div><span className="flex items-center gap-2 text-sm font-bold"><Navigation className="h-4 w-4" />Journey started</span></div>
      <main className="grid min-h-[calc(100dvh-190px)] lg:grid-cols-[1fr_340px]">
        <section aria-label="Journey map" className="relative h-[55dvh] min-h-96 lg:h-auto lg:min-h-[calc(100dvh-190px)]"><ClientOnly fallback={<div className="flex h-full items-center justify-center bg-sage/20">Opening map…</div>}><JourneyMap party={party} choosing={false} onPick={ignorePick} /></ClientOnly></section>
        <aside className="paper-sheet border-t-2 border-crust bg-offwhite px-5 py-6 lg:border-l-2 lg:border-t-0">
          <section className="border-b-2 border-crust/15 pb-6"><h2 className="flex items-center gap-2 text-lg font-extrabold"><LocateFixed className="h-5 w-5" />Your location</h2><p className="mt-2 text-sm text-muted-foreground">Shared only with this party, for 30 minutes after each refresh.</p><PopButton tone="sage" disabled={busy} onClick={refreshLocation} className="mt-4 flex items-center justify-center gap-2 text-sm"><RefreshCw className="h-4 w-4" />{busy ? "One sec…" : self?.location ? "Refresh my location" : "Share my location"}</PopButton>{self?.location && <PopButton tone="apricot" disabled={busy} onClick={() => void mutate("clear_location")} className="mt-3 text-sm">Stop sharing</PopButton>}{locationError && <p role="alert" className="mt-3 text-sm">{locationError}</p>}</section>
          <HangoutPanel code={code} party={party} workflow={workflow} isBusy={busy} pinHangout={(name, coords) => mutate("hangout", name, coords)} clearHangout={() => void mutate("clear_hangout")} />
          <section className="border-b-2 border-crust/15 py-6"><h2 className="flex items-center gap-2 text-lg font-extrabold"><CloudSun className="h-5 w-5" />Weather</h2>{weather.data ? <div className="mt-3"><p className="text-3xl font-extrabold">{Math.round(weather.data.temperature)}°C</p><p>{weather.data.description}</p>{weather.data.rain !== null && <p className="mt-1 text-sm">{weather.data.rain}% chance of rain</p>}<p className="mt-2 text-xs text-muted-foreground">Google Maps · {party.hangout ? "At the hangout" : "Near the crew"}</p></div> : <p className="mt-2 text-sm text-muted-foreground">{hasLocation ? "Current conditions near your party." : "Weather is available once a location is shared."}</p>}<PopButton tone="apricot" disabled={!hasLocation || weather.isFetching} className="mt-4 flex items-center justify-center gap-2 text-sm" onClick={() => void weather.refetch()}><RefreshCw className="h-4 w-4" />{weather.isFetching ? "Checking…" : "Refresh weather"}</PopButton>{weather.error instanceof Error && <p role="alert" className="mt-3 break-words text-sm">{weather.error.message}</p>}</section>
          <section className="pt-6"><h2 className="text-lg font-extrabold">The crew</h2><ul className="mt-3 space-y-4">{party.members.map((member) => <li key={member.id} className="flex items-center gap-3"><PaperIcon tone={member.host ? "chartreuse" : "sage"} className="h-9 w-9"><span className="font-extrabold">{member.name.slice(0, 1).toUpperCase()}</span></PaperIcon><div className="min-w-0"><p className="break-words text-sm font-bold">{member.name}{member.id === party.selfId ? " (you)" : ""}</p><p className="text-xs text-muted-foreground">{member.location ? "Exact location shared" : "Location not shared"}</p></div></li>)}</ul></section>
        </aside>
      </main>
    </>}
  </div>;
}