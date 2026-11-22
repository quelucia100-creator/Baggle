import {
  budgetCost as scoreBudget,
  haversineKm,
  hoursStatus,
  solve,
  travelCost as scoreTravel,
  travelMinutes,
  weatherPenalty,
} from "../hangout/solver";
import { parseWallTime } from "../hangout/tz";
import {
  DEFAULT_SOLVER_OPTIONS,
  type DayTime,
  type OpeningHours,
  type PriceTier,
  type SlotWeather,
  type Venue as SolverVenue,
  type WeatherHour,
} from "../hangout/types";
import type { ForecastHour, PlanOption, Point, Snapshot, Venue } from "./types";

export { haversineKm };

export function budgetCost(price: number | null, budget: number): number {
  return scoreBudget(price as PriceTier | null, budget as PriceTier);
}

export function travelCost(origin: Point, destination: Point, maximum: number): number {
  return scoreTravel(travelMinutes(origin, destination), maximum);
}

function dayTime(day: number, value: string): DayTime {
  const offset = value === "24:00" ? 1 : 0;
  return {
    day: ((day + offset) % 7) as DayTime["day"],
    ...parseWallTime(offset ? "00:00" : value),
  };
}

function planningHours(hours: NonNullable<Venue["hours"]>): OpeningHours {
  const periods: OpeningHours["periods"][number][] = [];
  for (const [weekday, dayPeriods] of Object.entries(hours)) {
    if (!/^[0-6]$/.test(weekday)) continue;
    const day = Number(weekday);
    for (const { open, close } of dayPeriods) {
      try {
        const closesTomorrow = close !== "24:00" && close <= open;
        periods.push({
          open: dayTime(day, open),
          close: dayTime(day + Number(closesTomorrow), close),
        });
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
      }
    }
  }
  return { periods };
}

export function openForSlot(venue: Venue, start: number, end: number): boolean {
  if (venue.hours === null) return true;
  const hours = planningHours(venue.hours);
  return hours.periods.length > 0 && hoursStatus(hours, { startMs: start, endMs: end }) === "open";
}

function solverVenue(venue: Venue, hours: OpeningHours | null): SolverVenue {
  return {
    ...venue,
    venueId: venue.placeId,
    isOutdoor: venue.outdoor,
    priceTier: venue.priceTier as PriceTier | null,
    hours,
  };
}

function solverForecast(forecast: readonly ForecastHour[]): WeatherHour[] {
  return forecast.map(({ at, temperature, precipitation, code }) => ({
    startsAt: at,
    temperatureC: temperature,
    precipProbability: precipitation,
    weatherCode: code,
  }));
}

function planWeather(slot: SlotWeather | null): PlanOption["weather"] {
  if (!slot || slot.tempC === null || slot.precipProb === null || slot.code === null) return null;
  return { temperature: slot.tempC, precipitation: slot.precipProb, code: slot.code };
}

export function weatherForSlot(venue: Venue, start: number, end: number, forecast: ForecastHour[]) {
  const result = weatherPenalty(
    solverVenue(venue, null),
    solverForecast(forecast),
    { startMs: start, endMs: end },
    DEFAULT_SOLVER_OPTIONS,
  );
  return { penalty: result.penalty, weather: planWeather(result.slot) };
}

export function solvePlans(
  snapshot: Snapshot,
  venues: Venue[],
  forecast: ForecastHour[] = [],
): { options: PlanOption[]; outliers: string[]; reason: string | null } {
  const { config, members } = snapshot;
  if (members.length < 2) {
    return { options: [], outliers: members.map(({ id }) => id), reason: "no_overlap" };
  }

  const candidates: SolverVenue[] = [];
  const publicVenues = new Map<string, PlanOption["venue"]>();
  for (const venue of venues) {
    if (venue.category !== config.category) continue;
    const schedule = venue.hours === null ? null : planningHours(venue.hours);
    // In the persisted contract, an empty schedule means closed. Only null means unknown.
    if (schedule?.periods.length === 0) continue;
    candidates.push(solverVenue(venue, schedule));
    publicVenues.set(venue.placeId, {
      placeId: venue.placeId,
      name: venue.name,
      category: venue.category,
      priceTier: venue.priceTier,
      location: venue.location,
      mapsUrl: venue.mapsUrl,
      outdoor: venue.outdoor,
    });
  }

  const result = solve({
    date: config.date,
    durationMin: config.durationMin,
    areaCenter: config.area,
    members: members.map(({ id, budget, ...member }) => ({
      ...member,
      memberId: id,
      budget: budget as PriceTier,
    })),
    venues: candidates,
    weather: solverForecast(forecast),
    // Keep time-slot rerolls for the current planning flow, including a one-venue catalogue.
    options: { ...DEFAULT_SOLVER_OPTIONS, distinctVenues: false },
  });

  if (result.kind === "no_plan") {
    return result.reason === "no_time"
      ? { options: [], outliers: [...result.outlierMemberIds], reason: "no_overlap" }
      : { options: [], outliers: [], reason: "no_venue_or_slot" };
  }

  return {
    options: result.options.map(({ venueId, rank: _rank, weather, ...option }) => {
      const venue = publicVenues.get(venueId);
      if (!venue) throw new Error("Ranked venue is missing");
      return { ...option, venue, weather: planWeather(weather) };
    }),
    outliers: [],
    reason: null,
  };
}
