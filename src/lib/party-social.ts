import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { membershipToken } from "./party";

export const partySocialSchema = z.object({
  ok: z.boolean(), error: z.string().optional(), result: z.string().optional(),
  items: z.array(z.object({ memberId: z.string(), username: z.string(), relationship: z.enum(["none", "friend", "incoming", "outgoing"]) })).optional(),
});
export async function partySocial(action: "attach" | "list" | "request" | "leave" | "disband", code: string, memberId?: string) {
  const { data, error } = await supabase.rpc("party_social", {
    p_action: action, p_code: code, p_token: membershipToken(), ...(memberId ? { p_member: memberId } : {}),
  });
  if (error) throw new Error(error.message);
  return partySocialSchema.parse(data);
}