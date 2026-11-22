import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlanningForecast } from "./forecast.server";
import type { PlanningConfig } from "./types";

const config: PlanningConfig = { date: "2026-11-22", durationMin: 90, areaLabel: "Montreal", area: { lat: 45.5, lng: -73.57 }, category: "park" };
afterEach(() => vi.unstubAllGlobals());
describe("Hourly planning forecast", () => {
  it("loads the event and overnight day with explicit UTC timestamps", async () => {
    const mock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ hourly: { time: ["2026-11-23T01:00"], temperature_2m: [5], precipitation_probability: [80], weather_code: [61] } })));
    vi.stubGlobal("fetch", mock);
    expect(await fetchPlanningForecast(config)).toEqual([{ at: "2026-11-23T01:00Z", temperature: 5, precipitation: 80, code: 61 }]);
    expect(String(mock.mock.calls[0]?.[0])).toContain("end_date=2026-11-23");
  });
  it("degrades to unavailable forecast on provider outage, timeout or invalid data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); })); expect(await fetchPlanningForecast(config)).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 }))); expect(await fetchPlanningForecast(config)).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}"))); expect(await fetchPlanningForecast(config)).toEqual([]);
  });
});