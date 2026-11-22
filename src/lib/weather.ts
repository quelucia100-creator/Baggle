import { z } from "zod";
export const weatherSchema = z.object({
  currentTime: z.string(),
  temperature: z.object({ degrees: z.number(), unit: z.literal("CELSIUS") }),
  weatherCondition: z.object({ description: z.object({ text: z.string() }) }),
  precipitation: z.object({ probability: z.object({ percent: z.number() }) }).optional(),
});
export const WEATHER_CACHE_MS = 10 * 60 * 1000;
export function summarizeWeather(input: unknown) {
  const data = weatherSchema.parse(input);
  return { temperature: data.temperature.degrees, description: data.weatherCondition.description.text, rain: data.precipitation?.probability.percent ?? null, observedAt: data.currentTime };
}