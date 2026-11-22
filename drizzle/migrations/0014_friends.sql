CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX friendships_pair_uniq ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.friend_action(p_action text, p_username text DEFAULT NULL, p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); target uuid; f public.friendships;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  IF p_action = 'request' THEN
    SELECT user_id INTO target FROM public.account_preferences WHERE lower(username) = lower(trim(p_username)) AND completed;
    IF target IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
    IF target = me THEN RETURN jsonb_build_object('ok', false, 'error', 'self'); END IF;
    SELECT * INTO f FROM public.friendships WHERE LEAST(requester_id, addressee_id) = LEAST(me, target) AND GREATEST(requester_id, addressee_id) = GREATEST(me, target);
    IF FOUND THEN
      IF f.status = 'pending' AND f.addressee_id = me THEN
        UPDATE public.friendships SET status = 'accepted' WHERE id = f.id;
        RETURN jsonb_build_object('ok', true, 'result', 'accepted');
      END IF;
      RETURN jsonb_build_object('ok', false, 'error', CASE WHEN f.status = 'accepted' THEN 'already_friends' ELSE 'already_requested' END);
    END IF;
    INSERT INTO public.friendships (requester_id, addressee_id) VALUES (me, target);
    RETURN jsonb_build_object('ok', true, 'result', 'requested');
  ELSIF p_action = 'accept' THEN
    UPDATE public.friendships SET status = 'accepted' WHERE id = p_id AND addressee_id = me AND status = 'pending';
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