import { useEffect, useRef, useState } from "react";
import { loadGoogleMap } from "@/lib/google-map";
import { LOCATION_RADIUS_METRES, type PartyState } from "@/lib/party";

export function JourneyMap({ party, choosing, onPick }: { party: PartyState; choosing: boolean; onPick: (point: { lat: number; lng: number }) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const overlays = useRef<Array<google.maps.Marker | google.maps.Circle>>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const framed = useRef(false);
  useEffect(() => {
    let active = true;
    loadGoogleMap().then(() => {
      if (!active || !container.current) return;
      map.current = new google.maps.Map(container.current, { center: { lat: 0, lng: 0 }, zoom: 2, clickableIcons: false, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, gestureHandling: "greedy", internalUsageAttributionIds: ["gmp_lovable_agentskills_v1"] });
      setReady(true);
    }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Map unavailable."); });
    return () => { active = false; overlays.current.forEach((item) => item.setMap(null)); if (map.current) google.maps.event.clearInstanceListeners(map.current); map.current = null; };
  }, []);
  useEffect(() => {
    if (!ready || !map.current) return;
    const listener = map.current.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (choosing && party.isHost && event.latLng) onPick({ lat: event.latLng.lat(), lng: event.latLng.lng() });
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
    for (const member of party.members) {
      if (!member.location) continue;
      const position = { lat: member.location.lat, lng: member.location.lng };
      const circle = new google.maps.Circle({ map: map.current, center: position, radius: LOCATION_RADIUS_METRES, fillColor: color("--sage"), fillOpacity: 0.25, strokeColor: color("--crust"), strokeOpacity: 0.45, strokeWeight: 1 });
      const marker = new google.maps.Marker({ map: map.current, position, title: member.name, label: { text: member.name.slice(0, 1).toUpperCase(), color: color("--crust") }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 13, fillColor: color(member.host ? "--chartreuse" : "--apricot"), fillOpacity: 1, strokeColor: color("--crust"), strokeWeight: 2 } });
      overlays.current.push(circle, marker);
      const circleBounds = circle.getBounds();
      if (circleBounds) bounds.union(circleBounds);
    }
    if (party.hangout) {
      const position = { lat: party.hangout.lat, lng: party.hangout.lng };
      const marker = new google.maps.Marker({ map: map.current, position, title: party.hangout.name, label: { text: "H", color: color("--offwhite") }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 17, fillColor: color("--tangerine"), fillOpacity: 1, strokeColor: color("--crust"), strokeWeight: 2 } });
      overlays.current.push(marker);
      bounds.extend(position);
    }
    if (!bounds.isEmpty() && !framed.current) { map.current.fitBounds(bounds, 60); framed.current = true; }
  }, [party.members, party.hangout, ready]);
  return <div className="relative h-full min-h-96 bg-sage/20">
    <div ref={container} className="h-full w-full" aria-label="Shared party map" />
    {!ready && <div className="absolute inset-0 flex items-center justify-center px-6 text-center" role="status">{error || "Loading Google Maps…"}</div>}
  </div>;
}