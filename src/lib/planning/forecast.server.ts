import { z } from "zod";
import { shiftDate } from "./tz";
import type { ForecastHour, PlanningConfig } from "./types";

/** Covers every candidate day (plus overnight spill into the next morning). */
const lastDate = (config: PlanningConfig & { dates?: string[] | undefined }) =>
  [config.date, ...(config.dates ?? [])].sort().at(-1) ?? config.date;

const responseSchema = z.object({ hourly: z.object({ time: z.array(z.string()), temperature_2m: z.array(z.number().nullable()),
  precipitation_probability: z.array(z.number().nullable()), weather_code: z.array(z.number().nullable()) }) });

export async function fetchPlanningForecast(config: PlanningConfig & { dates?: string[] | undefined }): Promise<ForecastHour[]> {
  const params = new URLSearchParams({ latitude: String(config.area.lat), longitude: String(config.area.lng), timezone: "GMT",
    start_date: [config.date, ...(config.dates ?? [])].sort()[0] ?? config.date, end_date: shiftDate(lastDate(config), 1), hourly: "temperature_2m,precipitation_probability,weather_code" });
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(2500), redirect: "manual" });
    if (!response.ok) return [];
    const parsed = responseSchema.safeParse(await response.json()); if (!parsed.success) return [];
    const h = parsed.data.hourly; const hours: ForecastHour[] = [];
    h.time.forEach((time, index) => {
      const temperature = h.temperature_2m[index]; const precipitation = h.precipitation_probability[index]; const code = h.weather_code[index];
      if (temperature == null || precipitation == null || code == null) return;
      const at = `${time}Z`; if (!Number.isFinite(Date.parse(at))) return;
      hours.push({ at, temperature, precipitation, code });
    });
    return hours;
  } catch { return []; }
}