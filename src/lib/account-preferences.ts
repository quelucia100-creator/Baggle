import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const preferenceSteps = ["username", "birth-date", "tastes", "food", "dietary", "accessibility", "alcohol"] as const;
export type PreferenceStep = typeof preferenceSteps[number];
export type AccountPreferences = Database["public"]["Tables"]["account_preferences"]["Row"];
export const stepTitles: Record<PreferenceStep, string> = {
  username: "Unique username", "birth-date": "Date of birth", tastes: "Tastes",
  food: "Food preferences", dietary: "Dietary restrictions", accessibility: "Accessibility", alcohol: "Alcohol presence",
};
export const tasteChoices = ["Food & cafes", "Outdoors", "Arts & culture", "Games", "Sports", "Live music", "Exploring"];
export const dietaryChoices = ["None", "Vegetarian", "Vegan", "Halal", "Kosher", "Gluten-free", "Dairy-free", "Nut allergy", "Other"];
export const foodChoices = ["No preference", "Italian", "Asian", "Middle Eastern", "Mexican", "Indian", "Local & comfort food", "Bakery & desserts", "Other"];
export const allergyChoices = ["None", "Peanuts", "Tree nuts", "Milk", "Eggs", "Wheat", "Soy", "Fish", "Shellfish", "Sesame", "Other"];
export const accessibilityChoices = ["None", "Step-free access", "Accessible toilets", "Seating available", "Low-noise spaces", "Other"];
export const alcoholChoices = [
  { value: "avoid", label: "Prefer no alcohol" },
  { value: "comfortable", label: "Comfortable with alcohol present" },
  { value: "no_preference", label: "No preference" },
];

export function validBirthDate(value: string | null, today = new Date()): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.getFullYear() >= 1900 &&
    date.getFullYear() === Number(value.slice(0, 4)) && date.getMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getDate() === Number(value.slice(8, 10)) && value <= localDate(today);
}
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function ageFromBirthDate(value: string, today = new Date()): number {
  let age = today.getFullYear() - Number(value.slice(0, 4));
  if (localDate(today).slice(5) < value.slice(5)) age--;
  return age;
}
function validChoices(values: string[] | null, choices: string[], exclusiveNone = false, noneLabel = "None"): boolean {
  return Boolean(values?.length && values.every((v) => choices.includes(v)) &&
    (!exclusiveNone || !values.includes(noneLabel) || values.length === 1));
}
export function isStepComplete(step: PreferenceStep, p: AccountPreferences | null): boolean {
  if (!p) return false;
  switch (step) {
    case "username": return /^[a-zA-Z0-9_]{3,30}$/.test(p.username ?? "");
    case "birth-date": return validBirthDate(p.date_of_birth);
    case "tastes": return validChoices(p.tastes, tasteChoices);
    case "food": return validChoices(p.food_preferences, foodChoices, true, "No preference") && validChoices(p.food_allergies, allergyChoices, true);
    case "dietary": return validChoices(p.dietary, dietaryChoices, true);
    case "accessibility": return validChoices(p.accessibility, accessibilityChoices, true);
    case "alcohol": return alcoholChoices.some((c) => c.value === p.alcohol);
  }
}
export function firstMissingStep(p: AccountPreferences | null): PreferenceStep | undefined {
  return preferenceSteps.find((step) => !isStepComplete(step, p));
}
export function toggleChoice(values: string[] | null, value: string, noneLabel = "None"): string[] {
  if (value === noneLabel) return values?.includes(value) ? [] : [value];
  const current = (values ?? []).filter((v) => v !== noneLabel);
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}
export const accountPreferencesQuery = () => queryOptions({
  queryKey: ["account-preferences"], staleTime: 0,
  queryFn: async () => {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!auth.user) throw new Error("Please sign in to continue.");
    const { data, error } = await supabase.from("account_preferences").select("*").eq("user_id", auth.user.id).maybeSingle();
    if (error) throw error;
    return { userId: auth.user.id, preferences: data };
  },
});
export async function saveAccountPreferences(p: AccountPreferences): Promise<AccountPreferences> {
  const { data, error } = await supabase.from("account_preferences").upsert(p).select("*").single();
  if (error) {
    if (error.code === "23505") throw new Error("That username is taken. Try another one.");
    throw new Error("Your answers could not be saved. Please try again.");
  }
  return data;
}
export function emptyPreferences(userId: string): AccountPreferences {
  return { user_id: userId, username: null, date_of_birth: null, tastes: null, food_preferences: null, food_allergies: null, dietary: null, accessibility: null, alcohol: null, completed: false };
}