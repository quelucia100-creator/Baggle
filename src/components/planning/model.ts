import { configSchema, preferencesSchema, type PlanningState } from "@/lib/planning/types";
import { montrealToday, shiftDate, PLANNING_TIME_ZONE } from "@/lib/planning/tz";

export const categories = [
  { value: "park", label: "Park" }, { value: "cafe", label: "Café" },
  { value: "museum", label: "Museum" }, { value: "restaurant", label: "Restaurant" },
  { value: "activity", label: "Activity" },
] as const;
export const budgets = ["Free", "Low cost · $", "Moderate · $$", "Higher · $$$", "Flexible · $$$$"];
export type PlanningCommand =
  | { action: "configure"; config: ReturnType<typeof configSchema.parse> }
  | { action: "save"; preferences: ReturnType<typeof preferencesSchema.parse> }
  | { action: "lock" | "finalize" | "reopen" }
  | { action: "vote" | "host_reroll"; revision: number };

export function validateConfig(input: unknown, today = montrealToday()) {
  const result = configSchema.safeParse(input);
  if (!result.success) throw new Error("Check the category, date, duration and meeting coordinates.");
  if (result.data.date < today || result.data.date > shiftDate(today, 14)) {
    throw new Error("Choose a Montreal date from today through the next 14 days.");
  }
  // shiftDate rejects impossible civil dates as well as validating the schema's format.
  try { shiftDate(result.data.date, 0); } catch { throw new Error("Choose a valid date."); }
  return result.data;
}

export function validatePreferences(input: unknown) {
  const result = preferencesSchema.safeParse(input);
  if (!result.success) throw new Error("Check your budget, availability, travel limit and optional coordinate pair.");
  return result.data;
}

export function planningControls(state: PlanningState, isHost: boolean, selfId: string) {
  const remaining = Math.max(0, state.optionCount - state.planIndex - 1);
  return {
    ready: state.members.filter((member) => member.submitted).length,
    remaining,
    canLock: isHost && state.status === "collecting" && state.members.filter((member) => member.submitted).length >= 2,
    canVote: state.status === "locked" && remaining > 0 && state.groupRerollsUsed < 3 && !state.selfVoted && state.members.some((member) => member.id === selfId && member.submitted),
    canReroll: isHost && state.status === "locked" && remaining > 0,
    canFinalize: isHost && state.status === "locked",
    canReopen: isHost && state.status === "no_plan",
  };
}

export function formatPlanTime(at: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PLANNING_TIME_ZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(at));
}

export function planningError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.startsWith("google maps") || message.startsWith("connect google maps") || message.startsWith("event travel checks"))
    return "Google Maps couldn't check travel. Check its connection or try again; your private answers are saved.";
  if (message.includes("revision") || message.includes("stale")) return "The plan changed. We've checked the latest option; please try again.";
  if (message.includes("permission") || message.includes("host") || message.includes("member") || message.includes("capability")) return "This action isn't available to you. Check your party membership and try again.";
  return "We couldn't confirm that change. Your edits are kept; check the current status before trying again.";
}