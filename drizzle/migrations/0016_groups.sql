CREATE TABLE public.friend_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.friend_group_members (
  group_id uuid NOT NULL REFERENCES public.friend_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
GRANT ALL ON public.friend_groups TO service_role;
GRANT ALL ON public.friend_group_members TO service_role;
ALTER TABLE public.friend_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_group_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.group_action(p_action text, p_group uuid DEFAULT NULL, p_name text DEFAULT NULL, p_username text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); g public.friend_groups; target uuid; new_id uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  IF p_action = 'create' THEN
    IF p_name IS NULL OR char_length(trim(p_name)) NOT BETWEEN 1 AND 40 THEN RETURN jsonb_build_object('ok', false, 'error', 'bad_name'); END IF;
    INSERT INTO public.friend_groups (owner_id, name) VALUES (me, trim(p_name)) RETURNING id INTO new_id;
    INSERT INTO public.friend_group_members (group_id, user_id) VALUES (new_id, me);
    RETURN jsonb_build_object('ok', true, 'id', new_id);
  ELSIF p_action = 'list' THEN
    RETURN jsonb_build_object('ok', true, 'groups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', fg.id, 'name', fg.name, 'is_owner', fg.owner_id = me, 'updated_at', fg.updated_at,
        'members', (SELECT COALESCE(jsonb_agg(jsonb_build_object('username', ap.username, 'is_owner', m.user_id = fg.owner_id, 'is_me', m.user_id = me) ORDER BY m.added_at), '[]'::jsonb)
                    FROM public.friend_group_members m LEFT JOIN public.account_preferences ap ON ap.user_id = m.user_id WHERE m.group_id = fg.id)
      ) ORDER BY fg.updated_at DESC)
      FROM public.friend_groups fg
      WHERE EXISTS (SELECT 1 FROM public.friend_group_members x WHERE x.group_id = fg.id AND x.user_id = me)), '[]'::jsonb));
  END IF;
  SELECT * INTO g FROM public.friend_groups WHERE id = p_group FOR UPDATE;
  IF NOT FOUND OR g.owner_id <> me THEN RETURN jsonb_build_object('ok', false, 'error', 'not_allowed'); END IF;
  IF p_action IN ('add', 'remove') THEN
    SELECT user_id INTO target FROM public.account_preferences WHERE lower(username) = lower(trim(p_username)) AND completed;
    IF target IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  END IF;
  IF p_action = 'add' THEN
    IF NOT EXISTS (SELECT 1 FROM public.friendships WHERE status = 'accepted'
      AND LEAST(requester_id, addressee_id) = LEAST(me, target) AND GREATEST(requester_id, addressee_id) = GREATEST(me, target)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_friend');
    END IF;
    IF (SELECT count(*) FROM public.friend_group_members WHERE group_id = g.id) >= 10 THEN RETURN jsonb_build_object('ok', false, 'error', 'full'); END IF;
    INSERT INTO public.friend_group_members (group_id, user_id) VALUES (g.id, target) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'already_member'); END IF;
    UPDATE public.friend_groups SET updated_at = now() WHERE id = g.id;
    RETURN jsonb_build_object('ok', true);
  ELSIF p_action = 'remove' THEN
    IF target = me THEN RETURN jsonb_build_object('ok', false, 'error', 'not_allowed'); END IF;
    DELETE FROM public.friend_group_members WHERE group_id = g.id AND user_id = target;
    UPDATE public.friend_groups SET updated_at = now() WHERE id = g.id;
    RETURN jsonb_build_object('ok', true);
  ELSIF p_action = 'delete' THEN
    DELETE FROM public.friend_groups WHERE id = g.id;
    RETURN jsonb_build_object('ok', true);
  END IF;
  RAISE EXCEPTION 'bad_action';
END $$;
REVOKE ALL ON FUNCTION public.group_action(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_action(text, uuid, text, text) TO authenticated;