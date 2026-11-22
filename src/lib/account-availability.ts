import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { availabilityDaySchema, validateAvailability, weekdaySchema, type AvailabilityDay } from "./account-availability-model";

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Please sign in to save your availability.");
  return data.user.id;
}

export const accountAvailabilityQuery = () => queryOptions({
  queryKey: ["account-weekly-availability"],
  staleTime: 0,
  queryFn: async (): Promise<AvailabilityDay[]> => {
    const userId = await currentUserId();
    const { data, error } = await supabase.from("account_weekly_availability")
      .select("weekday,busy_slots,confirmed").eq("user_id", userId).order("weekday");
    if (error) throw new Error("Your availability could not be loaded. Please try again.");
    return data.map((row) => availabilityDaySchema.parse({ weekday: row.weekday, busy: row.busy_slots, confirmed: row.confirmed }));
  },
});

export async function saveAvailability(day: AvailabilityDay): Promise<AvailabilityDay> {
  const errorMessage = validateAvailability(day);
  if (errorMessage) throw new Error(errorMessage);
  const userId = await currentUserId();
  const { data, error } = await supabase.from("account_weekly_availability").upsert({
    user_id: userId, weekday: day.weekday, busy_slots: day.busy, confirmed: day.confirmed, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,weekday" }).select("weekday,busy_slots,confirmed").single();
  if (error) throw new Error("Your availability could not be saved. Please try again.");
  return availabilityDaySchema.parse({ weekday: data.weekday, busy: data.busy_slots, confirmed: data.confirmed });
}

export async function removeAvailability(weekday: number): Promise<void> {
  weekdaySchema.parse(weekday);
  const userId = await currentUserId();
  const { error } = await supabase.from("account_weekly_availability").delete().eq("user_id", userId).eq("weekday", weekday);
  if (error) throw new Error("This day could not be removed. Please try again.");
}