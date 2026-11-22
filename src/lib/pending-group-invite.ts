import { supabase } from "@/integrations/supabase/client";
import { readStored, writeStored } from "./planning-client";

/**
 * A group chosen on "Start a journey" is only invited once the host has finished setting up
 * the hangout (the database refuses earlier invites). The choice waits in this tab meanwhile.
 */
const key = (code: string) => `baggle-pending-group-${code}`;
const GROUP_ID = /^[0-9a-f-]{36}$/i;

export function rememberGroupInvite(code: string, groupId: string): void {
  if (GROUP_ID.test(groupId)) writeStored("session", key(code), groupId);
}

export function hasPendingGroupInvite(code: string): boolean {
  return GROUP_ID.test(readStored("session", key(code)) ?? "");
}

/** Sends the remembered invite. Resolves true when sent; the choice is kept if it fails. */
export async function sendPendingGroupInvite(code: string): Promise<boolean> {
  const groupId = readStored("session", key(code));
  if (!groupId || !GROUP_ID.test(groupId)) return false;
  const { data, error } = await supabase.rpc("invite_group_to_journey", {
    p_group: groupId,
    p_code: code,
  });
  if (error || !(data as { ok?: boolean } | null)?.ok) return false;
  writeStored("session", key(code), null);
  return true;
}
