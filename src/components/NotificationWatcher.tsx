import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { notificationsQuery, notificationText } from "@/lib/notifications";

/** Pops up each new notification once, on any screen, while signed in. */
export function NotificationWatcher() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") setSignedIn(!!session);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const { data } = useQuery({ ...notificationsQuery(), enabled: signedIn, refetchInterval: 8000, refetchIntervalInBackground: false });
  const seen = useRef<Set<string> | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!data) return;
    if (!seen.current) { seen.current = new Set(data.map((n) => n.id)); return; }
    for (const n of data) {
      if (seen.current.has(n.id)) continue;
      seen.current.add(n.id);
      if (!n.read) toast(notificationText(n), { action: { label: "View", onClick: () => void navigate({ to: "/notifications" }) } });
    }
  }, [data, navigate]);
  useEffect(() => { if (!signedIn) seen.current = null; }, [signedIn]);
  return null;
}
