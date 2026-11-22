import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const openingSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  startSlot: z.number().int().min(0).max(59),
  endSlot: z.number().int().min(1).max(60),
}).strict().refine((w) => w.endSlot > w.startSlot);
export const groupOpeningsSchema = z.object({
  ok: z.literal(true), openings: z.array(openingSchema), canPoke: z.boolean(),
}).strict();
export type GroupOpening = z.infer<typeof openingSchema>;

export function openingTime(slot: number): string {
  const minutes = (slot * 30) % 1440;
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${minutes % 60 === 0 ? "00" : "30"} ${hour < 12 ? "am" : "pm"}${slot >= 48 ? " next day" : ""}`;
}

export const groupOpeningsQuery = (groupId: string) => queryOptions({
  queryKey: ["group-openings", groupId],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("group_weekly_action", { p_action: "read", p_group: groupId });
    if (error) throw new Error("Couldn't load shared openings.");
    return groupOpeningsSchema.parse(data);
  },
  refetchInterval: 30000,
});

const pokeSchema = z.object({ ok: z.boolean(), error: z.string().optional() }).strict();
export async function pokeGroup(groupId: string, weekday: number) {
  z.number().int().min(1).max(7).parse(weekday);
  const { data, error } = await supabase.rpc("group_weekly_action", { p_action: "poke", p_group: groupId, p_weekday: weekday });
  if (error) throw new Error("Couldn't send the poke. Try again.");
  const result = pokeSchema.parse(data);
  if (!result.ok) {
    if (result.error === "cooldown") throw new Error("This group was poked recently. Try again in an hour.");
    if (result.error === "no_opening") throw new Error("That opening changed. Choose another shared weekday.");
    throw new Error("You need to be a member of this group to poke it.");
  }
  return result;
}