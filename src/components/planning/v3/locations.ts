import { areas } from "../wizard-model";
import { approximate } from "./member-model";

/** Real Montréal neighbourhoods with their actual coordinates (shared with the V2 presets). */
export const PLACE_PRESETS = areas.map((area) => ({
  id: area.id,
  label: area.label,
  note: area.note,
  lat: area.lat,
  lng: area.lng,
}));
export type PlacePreset = (typeof PLACE_PRESETS)[number];

export function searchPlaces(query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return PLACE_PRESETS;
  return PLACE_PRESETS.filter(
    (place) => place.label.toLowerCase().includes(term) || place.note.toLowerCase().includes(term),
  );
}

export const mapsLink = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;

export type LocateResult =
  | { status: "ok"; lat: number; lng: number }
  | { status: "denied" | "timeout" | "unavailable" | "unsupported" | "insecure" };

/**
 * Asks for the browser location. Call ONLY from a user gesture (button click).
 * Coordinates are rounded to ~1 km before they leave this function and are never logged.
 */
export function locateOnce(timeoutMs = 10_000): Promise<LocateResult> {
  if (typeof window === "undefined") return Promise.resolve({ status: "unsupported" });
  if (!window.isSecureContext) return Promise.resolve({ status: "insecure" });
  if (!("geolocation" in navigator) || !navigator.geolocation)
    return Promise.resolve({ status: "unsupported" });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          status: "ok",
          lat: approximate(position.coords.latitude),
          lng: approximate(position.coords.longitude),
        }),
      (error) =>
        resolve({
          status:
            error.code === error.PERMISSION_DENIED
              ? "denied"
              : error.code === error.TIMEOUT
                ? "timeout"
                : "unavailable",
        }),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60_000 },
    );
  });
}

export const LOCATE_MESSAGES: Record<Exclude<LocateResult["status"], "ok">, string> = {
  denied: "Location permission was denied. Choose a place below instead.",
  timeout: "Finding your location took too long. Try again or choose a place below.",
  unavailable: "Your location isn't available right now. Choose a place below instead.",
  unsupported: "This browser can't share a location. Choose a place below instead.",
  insecure: "Location needs a secure (https) connection. Choose a place below instead.",
};
