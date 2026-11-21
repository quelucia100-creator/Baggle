import { describe, expect, it } from "vitest";
import { summarizeWeather } from "./weather";
import { LOCATION_RADIUS_METRES } from "./party";
describe("Journey map rules", () => {
  it("uses the confirmed 500 metre radius", () => { expect(LOCATION_RADIUS_METRES).toBe(500); });
  it("keeps weather in Celsius", () => {
    expect(summarizeWeather({ currentTime: "2026-11-21T23:00:00Z", temperature: { degrees: 13.7, unit: "CELSIUS" }, weatherCondition: { description: { text: "Sunny" } } }).temperature).toBe(13.7);
  });
});