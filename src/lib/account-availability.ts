import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { availabilityDaySchema, validateAvailability, type AvailabilityDay } from "./account-availability-model";

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Please sign in to save your availability.");
  return data.user.id;
}

export const accountAvailabilityQuery = () => queryOptions({
  queryKey: ["account-availability"],
  staleTime: 0,
  queryFn: async (): Promise<AvailabilityDay[]> => {
    const userId = await currentUserId();
    const { data, error } = await supabase.from("account_availability")
      .select("available_date,busy_slots,confirmed").eq("user_id", userId).order("available_date");
    if (error) throw new Error("Your availability could not be loaded. Please try again.");
    return data.map((row) => availabilityDaySchema.parse({ date: row.available_date, busy: row.busy_slots, confirmed: row.confirmed }));
  },
});

export async function saveAvailability(day: AvailabilityDay): Promise<AvailabilityDay> {
  const errorMessage = validateAvailability(day, Date.now());
  if (errorMessage) throw new Error(errorMessage);
  const userId = await currentUserId();
  const { data, error } = await supabase.from("account_availability").upsert({
    user_id: userId, available_date: day.date, busy_slots: day.busy, confirmed: day.confirmed, updated_at: new Date().toISOString(),
  }).select("available_date,busy_slots,confirmed").single();
  if (error) throw new Error("Your availability could not be saved. Please try again.");
  return availabilityDaySchema.parse({ date: data.available_date, busy: data.busy_slots, confirmed: data.confirmed });
}

export async function removeAvailability(date: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from("account_availability").delete().eq("user_id", userId).eq("available_date", date);
  if (error) throw new Error("This day could not be removed. Please try again.");
}