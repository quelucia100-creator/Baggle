import { useEffect, useRef, useState } from "react";
import { loadGoogleMap } from "@/lib/google-map";
import { type PartyState } from "@/lib/party";
import {
  memberInitials,
  memberTone,
  routeMatchesDestination,
  type JourneyRoutes,
  type MapDestination,
} from "@/lib/journey-map-model";
import { Button } from "@/components/ui/button";
import { Maximize2, RefreshCw } from "lucide-react";

export function JourneyMap({
  party,
  choosing,
  onPick,
  destination,
  routes,
}: {
  party: PartyState;
  choosing: boolean;
  onPick: (point: { lat: number; lng: number }) => void;
  destination?: MapDestination;
  routes?: JourneyRoutes;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const overlays = useRef<Array<google.maps.Marker>>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const framed = useRef(false);
  const boundsRef = useRef<google.maps.LatLngBounds | null>(null);
  const lines = useRef<google.maps.Polyline[]>([]);
  const [attempt, setAttempt] = useState(0);
  const destinationKey = `${destination?.lat ?? party.hangout?.lat},${destination?.lng ?? party.hangout?.lng}`;
  useEffect(() => {
    framed.current = false;
  }, [destinationKey]);
  const fit = () => {
    if (!map.current || !boundsRef.current || boundsRef.current.isEmpty()) return;
    map.current.fitBounds(boundsRef.current, 55);
    google.maps.event.addListenerOnce(map.current, "idle", () => {
      const zoom = map.current?.getZoom();
      if (zoom !== undefined && zoom > 17) map.current?.setZoom(17);
    });
  };
  useEffect(() => {
    let active = true;
    setError("");
    setReady(false);
    loadGoogleMap()
      .then(() => {
        if (!active || !container.current) return;
        map.current = new google.maps.Map(container.current, {
          center: { lat: 0, lng: 0 },
          zoom: 2,
          clickableIcons: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: "greedy",
          internalUsageAttributionIds: ["gmp_lovable_agentskills_v1"],
        });
        setReady(true);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Map unavailable.");
      });
    return () => {
      active = false;
      overlays.current.forEach((item) => item.setMap(null));
      lines.current.forEach((item) => item.setMap(null));
      if (map.current) google.maps.event.clearInstanceListeners(map.current);
      map.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const listener = map.current.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (choosing && party.isHost && event.latLng)
        onPick({ lat: event.latLng.lat(), lng: event.latLng.lng() });
    });
    return () => listener.remove();
  }, [ready, choosing, party.isHost, onPick]);
  useEffect(() => {
    if (!ready || !map.current || !container.current) return;
    overlays.current.forEach((item) => item.setMap(null));
    overlays.current = [];
    const styles = getComputedStyle(container.current);
    const color = (token: string) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return styles.getPropertyValue(token).trim();
      ctx.fillStyle = styles.getPropertyValue(token).trim();
      return ctx.fillStyle;
    };
    const bounds = new google.maps.LatLngBounds();
    for (const [index, member] of party.members.entries()) {
      if (!member.location) continue;
      const position = { lat: member.location.lat, lng: member.location.lng };
      const marker = new google.maps.Marker({
        map: map.current,
        position,
        title: `${member.name}${member.id === party.selfId ? " (you)" : ""}`,
        label: {
          text: memberInitials(member.name),
          color: color("--crust"),
          fontWeight: "800",
          fontSize: "12px",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 17,
          fillColor: color(`--${memberTone(index)}`),
          fillOpacity: 1,
          strokeColor: color("--crust"),
          strokeWeight: 2,
        },
      });
      overlays.current.push(marker);
      bounds.extend(position);
    }
    const target = destination ?? party.hangout;
    if (target) {
      const position = { lat: target.lat, lng: target.lng };
      const marker = new google.maps.Marker({
        map: map.current,
        position,
        title: target.name,
        label: { text: "P", color: color("--offwhite"), fontWeight: "800" },
        icon: {
          path: "M 0,0 C -4,-5 -11,-13 -11,-21 A 11,11 0 1,1 11,-21 C 11,-13 4,-5 0,0 Z",
          scale: 1.4,
          labelOrigin: new google.maps.Point(0, -21),
          fillColor: color("--crust"),
          fillOpacity: 1,
          strokeColor: color("--offwhite"),
          strokeWeight: 2,
        },
        zIndex: 100,
      });
      overlays.current.push(marker);
      bounds.extend(position);
    }
    boundsRef.current = bounds;
    if (!bounds.isEmpty() && !framed.current) {
      fit();
      framed.current = true;
    }
  }, [party.members, party.hangout, party.selfId, destination, ready]);
  useEffect(() => {
    let active = true;
    lines.current.forEach((line) => line.setMap(null));
    lines.current = [];
    if (
      !ready ||
      !map.current ||
      !routes ||
      !destination ||
      !routeMatchesDestination(routes, destination)
    )
      return;
    void google.maps
      .importLibrary("geometry")
      .then(() => {
        if (!active || !map.current || !container.current) return;
        const styles = getComputedStyle(container.current);
        for (const route of routes.routes) {
          const index = party.members.findIndex(
            (member) =>
              member.id === route.memberId &&
              member.location?.lat === route.origin.lat &&
              member.location?.lng === route.origin.lng,
          );
          if (index < 0) continue;
          const path = google.maps.geometry.encoding.decodePath(route.encodedPolyline);
          if (path.length < 2) continue;
          const canvas = document.createElement("canvas").getContext("2d");
          if (!canvas) continue;
          canvas.fillStyle = styles.getPropertyValue(`--${memberTone(index)}`).trim();
          lines.current.push(
            new google.maps.Polyline({
              map: map.current,
              path,
              strokeColor: canvas.fillStyle,
              strokeWeight: 5,
              strokeOpacity: 0.9,
              clickable: false,
            }),
          );
        }
      })
      .catch(() => {
        /* Optional route geometry must never prevent the map from working. */
      });
    return () => {
      active = false;
      lines.current.forEach((line) => line.setMap(null));
      lines.current = [];
    };
  }, [routes, destination, party.members, ready]);
  return (
    <div className="relative h-full min-h-96 bg-sage/20">
      <div ref={container} className="h-full w-full" aria-label="Shared party map" />
      {ready && (
        <Button
          variant="outline"
          size="icon"
          aria-label="Fit crew and plan"
          title="Fit crew and plan"
          className="absolute left-3 top-3 bg-offwhite"
          onClick={fit}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      )}
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p role={error ? "alert" : "status"}>{error || "Loading Google Maps…"}</p>
          {error && (
            <Button
              variant="outline"
              onClick={() => {
                framed.current = false;
                setAttempt((value) => value + 1);
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Retry map
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
