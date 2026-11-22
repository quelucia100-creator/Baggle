import { timeSchema, type PlanningConfig, type PlanningState } from "@/lib/planning/types";
import { validateConfig, validatePreferences } from "./model";

// Human-readable presets are presentation only; existing RPC coordinates remain authoritative.
export const areas = [
  {
    id: "plateau",
    label: "Le Plateau",
    note: "Parks & neighbourhood cafés",
    lat: 45.52,
    lng: -73.58,
  },
  { id: "downtown", label: "Downtown", note: "Around the city centre", lat: 45.5, lng: -73.57 },
  { id: "mile-end", label: "Mile End", note: "Bagels & local favourites", lat: 45.52, lng: -73.6 },
  { id: "verdun", label: "Verdun", note: "By the river", lat: 45.46, lng: -73.57 },
  { id: "rosemont", label: "Rosemont", note: "A little further east", lat: 45.55, lng: -73.58 },
  { id: "old-montreal", label: "Old Montreal", note: "Near the Old Port", lat: 45.5, lng: -73.55 },
] as const;
export const budgetCards = ["Free", "$", "$$", "$$$", "$$$$"];
export const travelPresets = [15, 30, 45, 60, 90];
export type PrivateDraft = {
  budget: number | null;
  freeFrom: string;
  freeTo: string;
  maxTravelMin: string;
  originLat: number | null;
  originLng: number | null;
};
export function privateDraft(preferences: PlanningState["selfPreferences"]): PrivateDraft {
  return preferences
    ? { ...preferences, maxTravelMin: String(preferences.maxTravelMin) }
    : {
        budget: null,
        freeFrom: "",
        freeTo: "",
        maxTravelMin: "30",
        originLat: null,
        originLng: null,
      };
}
export const roundOrigin = (n: number) => Math.round(n * 100) / 100;
export function originLabel(draft: Pick<PrivateDraft, "originLat" | "originLng">) {
  if (draft.originLat === null && draft.originLng === null) return "Use the group meeting area";
  return (
    areas.find(
      (area) =>
        area.lat === roundOrigin(draft.originLat ?? 0) &&
        area.lng === roundOrigin(draft.originLng ?? 0),
    )?.label ?? "Your saved starting area"
  );
}
export function areaConfig(config: PlanningConfig, id: string): PlanningConfig {
  const area = areas.find((entry) => entry.id === id);
  return area
    ? { ...config, areaLabel: area.label, area: { lat: area.lat, lng: area.lng } }
    : config;
}
export function validatePrivateStep(draft: PrivateDraft, step: number) {
  if (
    step === 0 &&
    (!timeSchema.safeParse(draft.freeFrom).success || !timeSchema.safeParse(draft.freeTo).success)
  )
    throw new Error("Choose both your start and end time.");
  if (
    step === 1 &&
    (draft.budget === null ||
      !Number.isInteger(draft.budget) ||
      draft.budget < 0 ||
      draft.budget > 4)
  )
    throw new Error("Choose a budget that feels right for you.");
  const travel = Number(draft.maxTravelMin);
  if (
    step === 2 &&
    (!draft.maxTravelMin.trim() || !Number.isInteger(travel) || travel < 5 || travel > 90)
  )
    throw new Error("Choose a travel limit from 5 to 90 minutes.");
  if (step === 3 && (draft.originLat === null) !== (draft.originLng === null))
    throw new Error("Choose a starting area or use the group meeting area.");
}
export function privatePayload(draft: PrivateDraft) {
  for (let step = 0; step < 4; step++) validatePrivateStep(draft, step);
  return validatePreferences({
    ...draft,
    maxTravelMin: Number(draft.maxTravelMin),
    originLat: draft.originLat === null ? null : roundOrigin(draft.originLat),
    originLng: draft.originLng === null ? null : roundOrigin(draft.originLng),
  });
}
export function validateHostStep(config: PlanningConfig, step: number) {
  if (step === 0) validateConfig(config);
  if (
    step === 1 &&
    (!config.areaLabel.trim() ||
      !Number.isFinite(config.area.lat) ||
      !Number.isFinite(config.area.lng))
  )
    throw new Error("Choose a meeting area.");
  if (step === 2) validateConfig(config);
}
