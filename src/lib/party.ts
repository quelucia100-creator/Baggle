import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const MAX_PARTY_MEMBERS = 10;
export const partySchema = z.object({
  code: z.string(), selfId: z.string(), isHost: z.boolean(),
  members: z.array(z.object({ id: z.string(), name: z.string(), host: z.boolean() })),
});
export type PartyState = z.infer<typeof partySchema>;
export const canRemoveMember = (party: PartyState, memberId: string) => party.isHost && party.selfId !== memberId;

export function membershipToken() {
  const key = "baggle-guest-membership";
  const existing = localStorage.getItem(key);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(key, token);
  return token;
}

export async function accessParty(action: "create" | "join" | "read" | "remove", code = "", name = "", memberId?: string) {
  const { data, error } = await supabase.rpc("party_access", {
    p_action: action, p_code: code, p_token: membershipToken(), p_name: name,
    ...(memberId ? { p_member: memberId } : {}),
  });
  if (error) throw new Error(error.message);
  return partySchema.parse(data);
}