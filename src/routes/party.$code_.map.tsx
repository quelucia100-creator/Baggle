import { createFileRoute, useHydrated, useNavigate, ClientOnly } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useCallback } from "react";
import { MapPin, LocateFixed, RefreshCw, CloudSun, Navigation, X } from "lucide-react";
import { toast } from "sonner";
import { PartyHeader } from "@/components/PartyHeader";
import { JourneyMap } from "@/components/JourneyMap";
import { Field, PopButton } from "@/components/Field";
import { PaperIcon } from "@/components/PaperIcon";
import { accessParty, membershipToken, LOCATION_RADIUS_METRES, type PartyAction } from "@/lib/party";
import { getPartyWeather } from "@/lib/weather.functions";

export const Route = createFileRoute("/party/$code_/map")({
  head: ({ params }) => ({ meta: [
    { title: `Journey map · ${params.code} — Baggle` },
    { name: "description", content: "Your crew's shared locations, local weather and decided hangout on Baggle." },
    { property: "og:title", content: "Your crew's journey — Baggle" },
    { property: "og:description", content: "Bring your friends together with a shared hangout map." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: MapPage,
});

function MapPage() {
  const { code } = Route.useParams();
  const hydrated = useHydrated();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryKey = ["party", code];
  const query = useQuery({ queryKey, queryFn: () => accessParty("read", code), enabled: hydrated, refetchInterval: 3000, retry: false });
  const party = query.isError ? undefined : query.data;
  const [busy, setBusy] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [hangoutName, setHangoutName] = useState("");
  const [weatherRequested, setWeatherRequested] = useState(false);
  const weatherFn = useServerFn(getPartyWeather);
  const weather = useQuery({ queryKey: ["party-weather", code], queryFn: () => weatherFn({ data: { code, token: membershipToken() } }), enabled: false, retry: false, staleTime: 600000 });
  useEffect(() => {
    if (party && !party.started) void navigate({ to: "/party/$code", params: { code }, replace: true });
  }, [party?.started, navigate, code]);
  const pick = useCallback((point: { lat: number; lng: number }) => { setPicked(point); setChoosing(false); }, []);
  const mutate = async (action: PartyAction, name = "", coords?: { lat: number; lng: number }) => {
    setBusy(true);
    try {
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
  const hasLocation = party?.hangout || party?.members.some((member) => member.location);

  return <div className="paper-sheet min-h-screen bg-offwhite">
    <PartyHeader code={code} map isHost={party?.isHost ?? false} busy={busy} onTeam={() => void mutate("team")} />
    {!party ? <main className="mx-auto max-w-4xl px-6 py-12"><h1 className="text-2xl font-extrabold">Your journey</h1><p className="mt-4" role="status">{query.error instanceof Error ? query.error.message : "Opening your map…"}</p></main> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-crust/20 px-5 py-5 sm:px-10"><div><h1 className="text-2xl font-extrabold">Where are we heading?</h1><p className="mt-1 text-sm text-muted-foreground">{party.members.length} friends · {LOCATION_RADIUS_METRES} m around each shared location</p></div><span className="flex items-center gap-2 text-sm font-bold"><Navigation className="h-4 w-4" />Journey started</span></div>
      <main className="grid min-h-[calc(100dvh-190px)] lg:grid-cols-[1fr_340px]">
        <section aria-label="Journey map" className="relative h-[55dvh] min-h-96 lg:h-auto lg:min-h-[calc(100dvh-190px)]"><ClientOnly fallback={<div className="flex h-full items-center justify-center bg-sage/20">Opening map…</div>}><JourneyMap party={party} choosing={choosing} onPick={pick} /></ClientOnly>{choosing && <div role="status" className="paper absolute left-4 top-4 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-lg border-2 border-crust bg-chartreuse px-4 py-3 font-bold shadow-pop">Choose a hangout location<PopButton aria-label="Cancel choosing hangout" title="Cancel" onClick={() => setChoosing(false)} className="!h-8 !w-8 flex shrink-0 items-center justify-center"><X className="h-4 w-4" /></PopButton></div>}</section>
        <aside className="paper-sheet border-t-2 border-crust bg-offwhite px-5 py-6 lg:border-l-2 lg:border-t-0">
          <section className="border-b-2 border-crust/15 pb-6"><h2 className="flex items-center gap-2 text-lg font-extrabold"><LocateFixed className="h-5 w-5" />Your location</h2><p className="mt-2 text-sm text-muted-foreground">Shared only with this party, for 30 minutes after each refresh.</p><PopButton tone="sage" disabled={busy} onClick={refreshLocation} className="mt-4 flex items-center justify-center gap-2 text-sm"><RefreshCw className="h-4 w-4" />{busy ? "One sec…" : self?.location ? "Refresh my location" : "Share my location"}</PopButton>{self?.location && <PopButton tone="apricot" disabled={busy} onClick={() => void mutate("clear_location")} className="mt-3 text-sm">Stop sharing</PopButton>}{locationError && <p role="alert" className="mt-3 text-sm">{locationError}</p>}</section>
          <section className="border-b-2 border-crust/15 py-6"><h2 className="flex items-center gap-2 text-lg font-extrabold"><MapPin className="h-5 w-5" />The hangout</h2><p className="mt-2 break-words font-bold">{party.hangout?.name ?? "Not decided yet"}</p>{party.isHost && <><PopButton tone="chartreuse" className="mt-4 text-sm" onClick={() => { setChoosing(true); setPicked(null); }}>{party.hangout ? "Change hangout" : "Choose hangout"}</PopButton>{party.hangout && <PopButton tone="apricot" disabled={busy} className="mt-3 text-sm" onClick={() => void mutate("clear_hangout")}>Clear hangout</PopButton>}</>}{picked && party.isHost && <form className="mt-4 space-y-3" onSubmit={async (event) => { event.preventDefault(); if (await mutate("hangout", hangoutName, picked)) { setPicked(null); setHangoutName(""); } }}><Field label="Hangout name" value={hangoutName} maxLength={80} required onChange={(event) => setHangoutName(event.target.value)} /><PopButton disabled={busy || !hangoutName.trim()} className="text-sm">Confirm hangout</PopButton></form>}</section>
          <section className="border-b-2 border-crust/15 py-6"><h2 className="flex items-center gap-2 text-lg font-extrabold"><CloudSun className="h-5 w-5" />Weather</h2>{weather.data ? <div className="mt-3"><p className="text-3xl font-extrabold">{Math.round(weather.data.temperature)}°C</p><p>{weather.data.description}</p>{weather.data.rain !== null && <p className="mt-1 text-sm">{weather.data.rain}% chance of rain</p>}<p className="mt-2 text-xs text-muted-foreground">Google Maps · {party.hangout ? "At the hangout" : "Near the crew"}</p></div> : <p className="mt-2 text-sm text-muted-foreground">{hasLocation ? "Current conditions near your party." : "Weather is available once a location is shared."}</p>}<PopButton tone="apricot" disabled={!hasLocation || weather.isFetching} className="mt-4 flex items-center justify-center gap-2 text-sm" onClick={() => { setWeatherRequested(true); void weather.refetch(); }}><RefreshCw className="h-4 w-4" />{weather.isFetching ? "Checking…" : weatherRequested ? "Refresh weather" : "Show weather"}</PopButton>{weather.error instanceof Error && <p role="alert" className="mt-3 break-words text-sm">{weather.error.message}</p>}</section>
          <section className="pt-6"><h2 className="text-lg font-extrabold">The crew</h2><ul className="mt-3 space-y-4">{party.members.map((member) => <li key={member.id} className="flex items-center gap-3"><PaperIcon tone={member.host ? "chartreuse" : "sage"} className="h-9 w-9"><span className="font-extrabold">{member.name.slice(0, 1).toUpperCase()}</span></PaperIcon><div className="min-w-0"><p className="break-words text-sm font-bold">{member.name}{member.id === party.selfId ? " (you)" : ""}</p><p className="text-xs text-muted-foreground">{member.location ? "Location shared · 500 m radius" : "Location not shared"}</p></div></li>)}</ul></section>
        </aside>
      </main>
    </>}
  </div>;
}