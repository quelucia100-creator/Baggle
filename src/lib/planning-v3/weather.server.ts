import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { ForecastHour } from "../planning/types";
import { shiftDate } from "../planning/tz";
import type { VenueCandidateV3 } from "./venue";

const hourly = z.object({
  time: z.array(z.string()),
  temperature_2m: z.array(z.number().nullable()),
  precipitation_probability: z.array(z.number().nullable()),
  weather_code: z.array(z.number().nullable()),
});
const responseSchema = z.object({ hourly });

export async function fetchV3Weather(venues: VenueCandidateV3[], days: string[], request = fetch) {
  const forecasts = new Map<string, ForecastHour[]>();
  const candidates = venues.slice(0, 12);
  if (!candidates.length || !days.length) return forecasts;
  // Montreal overnight can cross into the following UTC day. GMT avoids ambiguous DST forecast keys.
  const params = new URLSearchParams({
    latitude: candidates.map(({ location }) => location.lat).join(","),
    longitude: candidates.map(({ location }) => location.lng).join(","),
    start_date: days[0]!,
    end_date: shiftDate(days[days.length - 1]!, 1),
    timezone: "GMT",
    hourly: "temperature_2m,precipitation_probability,weather_code",
  });
  try {
    const response = await request(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(2200),
      redirect: "manual",
    });
    if (!response.ok) return forecasts;
    const data: unknown = await response.json();
    const items = Array.isArray(data) ? data : [data];
    if (items.length !== candidates.length) return forecasts;
    candidates.forEach((venue, index) => {
      const result = responseSchema.safeParse(items[index]);
      if (!result.success) return;
      const h = result.data.hourly;
      forecasts.set(
        venue.placeId,
        h.time.flatMap((time, i) => {
          const temperature = h.temperature_2m[i];
          const precipitation = h.precipitation_probability[i];
          const code = h.weather_code[i];
          const at = `${time}Z`;
          return temperature == null ||
            precipitation == null ||
            code == null ||
            !Number.isFinite(Date.parse(at))
            ? []
            : [{ at, temperature, precipitation, code }];
        }),
      );
    });
  } catch {
    /* Forecast failures leave outdoor candidates unverified. */
  }
  return forecasts;
}
