import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const MAX_PARTY_MEMBERS = 10;
export const LOCATION_RADIUS_METRES = 500;
export const locationSchema = z.object({ lat: z.number(), lng: z.number(), updatedAt: z.string() });
export const partySchema = z.object({
  code: z.string(), selfId: z.string(), isHost: z.boolean(),
  started: z.boolean().default(false),
  hangout: z.object({ name: z.string(), lat: z.number(), lng: z.number() }).nullable().default(null),
  members: z.array(z.object({ id: z.string(), name: z.string(), host: z.boolean(), location: locationSchema.nullable().default(null) })),
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

export type PartyAction = "create" | "join" | "read" | "remove" | "start" | "team" | "location" | "clear_location" | "hangout" | "clear_hangout";
export async function accessParty(action: PartyAction, code = "", name = "", memberId?: string, coords?: { lat: number; lng: number }) {
  const { data, error } = await supabase.rpc("party_journey", {
    p_action: action, p_code: code, p_token: membershipToken(), p_name: name,
    ...(memberId ? { p_member: memberId } : {}),
    ...(coords ? { p_lat: coords.lat, p_lng: coords.lng } : {}),
  });
  if (error) throw new Error(error.message);
  return partySchema.parse(data);
}