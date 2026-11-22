import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Notification = { id: string; kind: string; actor_username: string | null; read: boolean; created_at: string };

export const notificationsQuery = () =>
  queryOptions({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("id, kind, actor_username, read, created_at").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as Notification[];
    },
    refetchInterval: 20000,
  });

export function notificationText(n: Notification) {
  const who = n.actor_username ?? "Someone";
  if (n.kind === "friend_request") return `${who} sent you a friend request.`;
  if (n.kind === "friend_accepted") return `${who} accepted your friend request.`;
  return "You have a new update.";
}
