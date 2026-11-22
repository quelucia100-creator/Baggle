import { useId, useState } from "react";
import { Crosshair, ExternalLink, Loader2, MapPin, Search } from "lucide-react";
import { LOCATE_MESSAGES, locateOnce, mapsLink, searchPlaces } from "./locations";

export type PickedPlace = {
  source: "current_location" | "manual";
  label: string;
  lat: number;
  lng: number;
};

/**
 * Two real choices: device location (requested only when the button is tapped) or a
 * searchable list of real places with known coordinates. Free text without coordinates
 * is never accepted as a location.
 */
export function PlacePicker({
  value,
  onChange,
  allowCurrentLocation = true,
  currentLabel = "Near my current location",
  legend,
  disabled,
}: {
  value: PickedPlace | null;
  onChange: (place: PickedPlace) => void;
  allowCurrentLocation?: boolean;
  currentLabel?: string;
  legend: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const results = searchPlaces(query);
  const locate = async () => {
    setLocating(true);
    setLocateError("");
    const result = await locateOnce();
    setLocating(false);
    if (result.status === "ok")
      onChange({
        source: "current_location",
        label: currentLabel,
        lat: result.lat,
        lng: result.lng,
      });
    else setLocateError(LOCATE_MESSAGES[result.status]);
  };
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <legend className="mb-2 text-xs font-bold uppercase tracking-wider">{legend}</legend>
      {allowCurrentLocation && (
        <div>
          <button
            type="button"
            onClick={() => void locate()}
            disabled={locating}
            aria-pressed={value?.source === "current_location"}
            className={`paper flex min-h-14 w-full items-center gap-3 rounded-lg border-2 border-crust px-4 py-3 text-left text-sm font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-vista/50 ${value?.source === "current_location" ? "bg-chartreuse shadow-pop" : "bg-cream hover:bg-apricot"}`}
          >
            {locating ? (
              <Loader2 aria-hidden="true" className="h-5 w-5 motion-safe:animate-spin" />
            ) : (
              <Crosshair aria-hidden="true" className="h-5 w-5" />
            )}
            <span className="flex-1">
              {locating ? "Finding your location…" : "Use my current location"}
              <span className="mt-1 block text-xs font-normal">
                Your browser will ask first. Rounded to about 1 km and kept private.
              </span>
            </span>
          </button>
          {locateError && (
            <p role="alert" className="mt-2 text-sm font-bold">
              {locateError}
            </p>
          )}
        </div>
      )}
      <div>
        <label htmlFor={`${id}-search`} className="mb-1.5 block text-xs font-bold uppercase">
          Choose a location
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          />
          <input
            id={`${id}-search`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Montréal neighbourhoods"
            aria-controls={`${id}-results`}
            autoComplete="off"
            className="paper h-12 w-full rounded-2xl border-2 border-crust bg-cream pl-9 pr-4 text-crust placeholder:text-muted-foreground focus:bg-offwhite focus:outline-none focus:ring-4 focus:ring-vista/40"
          />
        </div>
        <div
          id={`${id}-results`}
          role="radiogroup"
          aria-label={`${legend} results`}
          className="mt-3 grid gap-2 sm:grid-cols-2"
        >
          {results.map((place) => {
            const checked =
              value?.source === "manual" && value.lat === place.lat && value.lng === place.lng;
            return (
              <label
                key={place.id}
                className={`paper flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border-2 border-crust px-4 py-3 text-sm font-bold focus-within:ring-4 focus-within:ring-vista/50 ${checked ? "bg-chartreuse shadow-pop" : "bg-cream hover:bg-apricot"}`}
              >
                <input
                  type="radio"
                  name={`${id}-place`}
                  checked={checked}
                  onChange={() =>
                    onChange({
                      source: "manual",
                      label: place.label,
                      lat: place.lat,
                      lng: place.lng,
                    })
                  }
                  className="sr-only"
                />
                <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span>
                  {place.label}
                  <span className="mt-1 block text-xs font-normal">{place.note}</span>
                </span>
              </label>
            );
          })}
          {!results.length && (
            <p role="status" className="text-sm">
              No matching place. Try another neighbourhood name.
            </p>
          )}
        </div>
      </div>
      {value && <SelectedPlace place={value} />}
    </fieldset>
  );
}

export function SelectedPlace({ place }: { place: { label: string; lat: number; lng: number } }) {
  return (
    <div className="paper flex items-center gap-3 rounded-lg border-2 border-crust bg-offwhite p-3 text-sm">
      <MapPin aria-hidden="true" className="h-5 w-5 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="block text-xs font-bold uppercase text-muted-foreground">Selected</span>
        <strong className="break-words">{place.label}</strong>
      </p>
      <a
        href={mapsLink(place.lat, place.lng)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs font-bold underline underline-offset-4"
      >
        Preview map
        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
