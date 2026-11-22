import { ClientOnly } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  Bike,
  Car,
  Footprints,
  LocateFixed,
  MapPin,
  Route,
  Square,
  TrainFront,
} from "lucide-react";
import { JourneyMap } from "@/components/JourneyMap";
import { Button } from "@/components/ui/button";
import { PaperIcon } from "@/components/PaperIcon";
import { accessParty, membershipToken, type PartyState } from "@/lib/party";
import { getJourneyRoutes } from "@/lib/journey-routes.functions";
import {
  memberInitials,
  memberTone,
  routeMatchesDestination,
  type JourneyRoutes,
  type MapDestination,
} from "@/lib/journey-map-model";

const ignorePick = () => {};
const modes = [
  { value: "WALK", label: "Walk", icon: Footprints },
  { value: "BICYCLE", label: "Bike", icon: Bike },
  { value: "TRANSIT", label: "Transit", icon: TrainFront },
  { value: "DRIVE", label: "Drive", icon: Car },
] as const;

export function PlanMap({
  party,
  destination,
  revision,
}: {
  party: PartyState;
  destination: MapDestination;
  revision: number;
}) {
  const queryClient = useQueryClient();
  const routesFn = useServerFn(getJourneyRoutes);
  const [sharing, setSharing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [mode, setMode] = useState<(typeof modes)[number]["value"]>("WALK");
  const [routes, setRoutes] = useState<JourneyRoutes>();
  const [routeError, setRouteError] = useState("");
  const [routing, setRouting] = useState(false);
  const requestId = useRef(0);
  const write = useRef<Promise<unknown> | null>(null);
  const self = party.members.find((member) => member.id === party.selfId);
  const located = party.members.filter((member) => member.location).length;
  useEffect(() => {
    requestId.current++;
    setRoutes(undefined);
    setRouting(false);
    setRouteError("");
  }, [revision, destination.lat, destination.lng, mode]);
  useEffect(
    () => () => {
      requestId.current++;
    },
    [],
  );
  useEffect(() => {
    if (!sharing) return;
    let active = true;
    let lastWrite = 0;
    if (!navigator.geolocation) {
      setLocationError("Your browser does not support location sharing.");
      setSharing(false);
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        if (!active || write.current || Date.now() - lastWrite < 15000) return;
        lastWrite = Date.now();
        const save = async () => {
          try {
            await queryClient.cancelQueries({ queryKey: ["party", party.code] });
            const updated = await accessParty("location", party.code, "", undefined, {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
            if (active) {
              queryClient.setQueryData(["party", party.code], updated);
              setLocationError("");
            }
          } catch {
            if (active)
              setLocationError("Couldn't update your shared location. Try sharing again.");
          }
        };
        write.current = save().finally(() => {
          write.current = null;
        });
      },
      (error) => {
        if (!active) return;
        setLocationError(
          error.code === 1
            ? "Location permission was denied. You can still view the plan map."
            : "Couldn't find your location. Try sharing again.",
        );
        setSharing(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
    return () => {
      active = false;
      navigator.geolocation.clearWatch(watch);
    };
  }, [sharing, party.code, queryClient]);
  const stop = async () => {
    setSharing(false);
    setStopping(true);
    try {
      await write.current;
      await queryClient.cancelQueries({ queryKey: ["party", party.code] });
      const updated = await accessParty("clear_location", party.code);
      queryClient.setQueryData(["party", party.code], updated);
      setRoutes(undefined);
      setLocationError("");
    } catch {
      setLocationError("Couldn't remove your shared location. Try Stop sharing again.");
    } finally {
      setStopping(false);
    }
  };
  const showRoutes = async () => {
    const id = ++requestId.current;
    setRouting(true);
    setRouteError("");
    setRoutes(undefined);
    try {
      const result = await routesFn({ data: { code: party.code, token: membershipToken(), mode } });
      if (requestId.current !== id) return;
      if (result.revision !== revision || !routeMatchesDestination(result, destination)) {
        setRouteError("The plan changed. Refresh it before showing routes.");
        return;
      }
      setRoutes(result);
    } catch (error) {
      if (requestId.current === id)
        setRouteError(
          error instanceof Error
            ? error.message
            : "Routes unavailable. The plan map is still available.",
        );
    } finally {
      if (requestId.current === id) setRouting(false);
    }
  };
  const visibleRoutes =
    routes?.routes.filter((route) =>
      party.members.some(
        (member) =>
          member.id === route.memberId &&
          member.location?.lat === route.origin.lat &&
          member.location?.lng === route.origin.lng,
      ),
    ) ?? [];
  return (
    <section aria-label="Live plan map" className="mt-8 min-w-0 border-y-2 border-crust/20 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xl font-extrabold">
          <MapPin className="h-5 w-5" />
          Meet the crew here
        </h3>
        <span className="text-xs font-bold text-muted-foreground">
          {located}/{party.members.length} locations shared
        </span>
      </div>
      <div className="h-[55dvh] min-h-96 max-h-[640px] overflow-hidden border-2 border-crust">
        <ClientOnly
          fallback={
            <div role="status" className="flex h-full items-center justify-center bg-sage/20">
              Opening map…
            </div>
          }
        >
          <JourneyMap
            party={party}
            choosing={false}
            onPick={ignorePick}
            destination={destination}
            {...(routes ? { routes } : {})}
          />
        </ClientOnly>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={stopping || sharing}
          onClick={() => {
            setLocationError("");
            setSharing(true);
          }}
          className="min-h-12 bg-sage"
        >
          <LocateFixed className="h-4 w-4" />
          {sharing ? "Live sharing on" : "Share live location"}
        </Button>
        {(sharing || self?.location || stopping) && (
          <Button
            variant="outline"
            disabled={stopping}
            onClick={() => void stop()}
            className="min-h-12 bg-offwhite"
          >
            <Square className="h-4 w-4" />
            {stopping ? "Stopping…" : "Stop sharing"}
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Device locations are shared with this party only and expire 30 minutes after the last
        update. Private planning origins stay private.
      </p>
      {locationError && (
        <p role="alert" className="mt-3 text-sm font-bold">
          {locationError}
        </p>
      )}
      <div
        className="mt-5 flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Route travel mode"
      >
        {modes.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            variant={mode === value ? "default" : "outline"}
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className="min-h-11"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={routing || located === 0}
          onClick={() => void showRoutes()}
          className="min-h-12 bg-chartreuse"
        >
          <Route className="h-4 w-4" />
          {routing ? "Finding routes…" : routes ? "Refresh routes" : "Show routes"}
        </Button>
        {routes && (
          <Button variant="ghost" onClick={() => setRoutes(undefined)} className="min-h-12">
            Hide routes
          </Button>
        )}
      </div>
      {routeError && (
        <p role="alert" className="mt-3 break-words text-sm">
          {routeError}
        </p>
      )}
      {routes && (
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          {routes.unavailable > 0 ? `${routes.unavailable} route(s) unavailable. ` : ""}
          {visibleRoutes.length === 0
            ? "No current routes to display."
            : "Google Maps route estimates · refresh after locations change."}
        </p>
      )}
      <ul className="mt-5 grid gap-3 sm:grid-cols-2" aria-label="Map legend">
        <li className="flex items-center gap-3">
          <PaperIcon tone="cream" className="h-9 w-9">
            <MapPin className="h-5 w-5" />
          </PaperIcon>
          <span className="min-w-0 break-words text-sm font-bold">{destination.name} · Plan</span>
        </li>
        {party.members.map((member, index) => {
          const route = visibleRoutes.find((entry) => entry.memberId === member.id);
          return (
            <li key={member.id} className="flex min-w-0 items-center gap-3">
              <PaperIcon tone={memberTone(index)} className="h-9 w-9 shrink-0">
                <span className="text-xs font-extrabold">{memberInitials(member.name)}</span>
              </PaperIcon>
              <div className="min-w-0">
                <p className="break-words text-sm font-bold">
                  {member.name}
                  {member.id === party.selfId ? " (you)" : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {route
                    ? `${(route.distanceMetres / 1000).toFixed(1)} km · ${Math.ceil(route.durationSeconds / 60)} min`
                    : member.location
                      ? "Location shared"
                      : "Location not shared"}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
