import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { availabilityDaySchema, type AvailabilityDay } from "@/lib/account-availability-model";

/** Owner-only data lives in this mounted screen, never a public party cache or URL. */
export function useAccountAvailability(): AvailabilityDay[] | null {
  const [rows, setRows] = useState<AvailabilityDay[] | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return;
      const result = await supabase.from("account_weekly_availability").select("weekday,busy_slots,confirmed").eq("user_id", user.id);
      if (result.error || !active) return;
      const parsed = (result.data ?? []).map((row) => availabilityDaySchema.safeParse({ weekday: row.weekday, busy: row.busy_slots, confirmed: row.confirmed }));
      setRows(parsed.flatMap((row) => row.success && row.data.confirmed ? [row.data] : []));
    })().catch(() => { /* A failed read never invents availability; the normal question remains. */ });
    return () => { active = false; };
  }, []);
  return rows;
}