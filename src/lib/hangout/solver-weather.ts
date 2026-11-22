import type { Interval, SlotWeather, SolverOptions, Venue, WeatherHour } from "./types";

const HOUR_MS = 3_600_000;
const RAIN_RANGES = [
  [51, 57],
  [61, 67],
  [80, 82],
  [95, 99],
] as const;
const SNOW_RANGES = [
  [71, 77],
  [85, 86],
] as const;

function within(code: number | null, ranges: readonly (readonly [number, number])[]): boolean {
  return code !== null && ranges.some(([min, max]) => code >= min && code <= max);
}

export function isSnow(code: number | null): boolean {
  return within(code, SNOW_RANGES);
}

function isRain(code: number | null): boolean {
  return within(code, RAIN_RANGES);
}

function codePriority(code: number): number {
  if (isSnow(code)) return 2;
  return isRain(code) ? 1 : 0;
}

function temperaturePenalty(temp: number | null, exemptCold: boolean): number {
  return temp !== null && (temp > 32 || (!exemptCold && temp < -10)) ? 0.4 : 0;
}

function temperatureDistance(temp: number): number {
  return Math.max(temp - 32, -10 - temp);
}

function weatherSummary(code: number | null, temp: number | null, precip: number | null): string {
  if (isSnow(code)) return "Snow expected";
  if (isRain(code)) return "Rain expected";
  if (precip !== null && precip >= 30) return `${Math.round(precip)}% chance of precipitation`;
  if (temp !== null && temp < -10) return "Very cold";
  if (temp !== null && temp > 32) return "Very hot";
  return "No severe weather expected";
}

export function weatherPenalty(
  venue: Venue,
  weather: readonly WeatherHour[] | null,
  slot: Interval,
  options: Pick<SolverOptions, "winterVenueWeatherExemption">,
): { penalty: number; slot: SlotWeather | null } {
  if (!weather) return { penalty: 0, slot: null };
  const exemptWinter = options.winterVenueWeatherExemption && venue.season === "winter";
  let penalty = 0;
  let tempC: number | null = null;
  let precipProb: number | null = null;
  let code: number | null = null;

  for (const hour of weather) {
    const start = Date.parse(hour.startsAt);
    if (!(start < slot.endMs && slot.startMs < start + HOUR_MS)) continue;

    const { temperatureC: temp, precipProbability: precip, weatherCode } = hour;
    if (venue.isOutdoor) {
      const precipitationPenalty = isSnow(weatherCode)
        ? !exemptWinter
        : isRain(weatherCode) || (precip ?? 0) >= 50;
      penalty = Math.max(
        penalty,
        precipitationPenalty ? 0.5 : 0,
        temperaturePenalty(temp, exemptWinter),
      );
    }

    if (precip !== null) precipProb = Math.max(precipProb ?? precip, precip);
    if (temp !== null) {
      const distance = temperatureDistance(temp);
      if (
        tempC === null ||
        distance > temperatureDistance(tempC) ||
        (distance === temperatureDistance(tempC) && temp < tempC)
      ) {
        tempC = temp;
      }
    }
    if (weatherCode !== null) {
      const priority = codePriority(weatherCode);
      if (
        code === null ||
        priority > codePriority(code) ||
        (priority === codePriority(code) && weatherCode > code)
      ) {
        code = weatherCode;
      }
    }
  }

  if (tempC === null && precipProb === null && code === null) return { penalty, slot: null };
  return {
    penalty,
    slot: { tempC, precipProb, code, summary: weatherSummary(code, tempC, precipProb) },
  };
}
