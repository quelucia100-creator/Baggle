CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  actor_username text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.friend_action(p_action text, p_username text DEFAULT NULL, p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); target uuid; f public.friendships; my_name text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  SELECT username INTO my_name FROM public.account_preferences WHERE user_id = me;
  IF p_action = 'request' THEN
    SELECT user_id INTO target FROM public.account_preferences WHERE lower(username) = lower(trim(p_username)) AND completed;
    IF target IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
    IF target = me THEN RETURN jsonb_build_object('ok', false, 'error', 'self'); END IF;
    SELECT * INTO f FROM public.friendships WHERE LEAST(requester_id, addressee_id) = LEAST(me, target) AND GREATEST(requester_id, addressee_id) = GREATEST(me, target);
    IF FOUND THEN
      IF f.status = 'pending' AND f.addressee_id = me THEN
        UPDATE public.friendships SET status = 'accepted' WHERE id = f.id;
        INSERT INTO public.notifications (user_id, kind, actor_username) VALUES (f.requester_id, 'friend_accepted', my_name);
        RETURN jsonb_build_object('ok', true, 'result', 'accepted');
      END IF;
      RETURN jsonb_build_object('ok', false, 'error', CASE WHEN f.status = 'accepted' THEN 'already_friends' ELSE 'already_requested' END);
    END IF;
    INSERT INTO public.friendships (requester_id, addressee_id) VALUES (me, target);
    INSERT INTO public.notifications (user_id, kind, actor_username) VALUES (target, 'friend_request', my_name);
    RETURN jsonb_build_object('ok', true, 'result', 'requested');
  ELSIF p_action = 'accept' THEN
    UPDATE public.friendships SET status = 'accepted' WHERE id = p_id AND addressee_id = me AND status = 'pending' RETURNING * INTO f;
    IF FOUND THEN
      INSERT INTO public.notifications (user_id, kind, actor_username) VALUES (f.requester_id, 'friend_accepted', my_name);
    END IF;
    RETURN jsonb_build_object('ok', FOUND);
  ELSIF p_action = 'remove' THEN
    DELETE FROM public.friendships WHERE id = p_id AND (requester_id = me OR addressee_id = me);
    RETURN jsonb_build_object('ok', FOUND);
  ELSIF p_action = 'list' THEN
    RETURN jsonb_build_object('ok', true, 'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', fr.id,
        'username', ap.username,
        'kind', CASE WHEN fr.status = 'accepted' THEN 'friend' WHEN fr.addressee_id = me THEN 'incoming' ELSE 'outgoing' END
      ) ORDER BY ap.username)
      FROM public.friendships fr
      JOIN public.account_preferences ap ON ap.user_id = CASE WHEN fr.requester_id = me THEN fr.addressee_id ELSE fr.requester_id END
      WHERE fr.requester_id = me OR fr.addressee_id = me), '[]'::jsonb));
  END IF;
  RAISE EXCEPTION 'bad_action';
END $$;
REVOKE ALL ON FUNCTION public.friend_action(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.friend_action(text, text, uuid) TO authenticated;