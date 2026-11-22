ALTER TABLE public.friend_group_members ADD COLUMN status text NOT NULL DEFAULT 'member' CHECK (status IN ('member','invited'));
ALTER TABLE public.notifications ADD COLUMN detail text;

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
        'id', fr.id, 'username', ap.username,
        'kind', CASE WHEN fr.status = 'accepted' THEN 'friend' WHEN fr.addressee_id = me THEN 'incoming' ELSE 'outgoing' END
      ) ORDER BY ap.username)
      FROM public.friendships fr
      JOIN public.account_preferences ap ON ap.user_id = CASE WHEN fr.requester_id = me THEN fr.addressee_id ELSE fr.requester_id END
      WHERE fr.requester_id = me OR fr.addressee_id = me), '[]'::jsonb));
  END IF;
  RAISE EXCEPTION 'bad_action';
END $$;

CREATE OR REPLACE FUNCTION public.group_action(p_action text, p_group uuid DEFAULT NULL, p_name text DEFAULT NULL, p_username text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); g public.friend_groups; target uuid; target_private boolean; new_id uuid; my_name text; is_friend boolean; new_status text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  IF p_action = 'create' THEN
    IF p_name IS NULL OR char_length(trim(p_name)) NOT BETWEEN 1 AND 40 THEN RETURN jsonb_build_object('ok', false, 'error', 'bad_name'); END IF;
    INSERT INTO public.friend_groups (owner_id, name) VALUES (me, trim(p_name)) RETURNING id INTO new_id;
    INSERT INTO public.friend_group_members (group_id, user_id) VALUES (new_id, me);
    RETURN jsonb_build_object('ok', true, 'id', new_id);
  ELSIF p_action = 'list' THEN
    RETURN jsonb_build_object('ok', true,
      'groups', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', fg.id, 'name', fg.name, 'is_owner', fg.owner_id = me, 'updated_at', fg.updated_at,
          'members', (SELECT COALESCE(jsonb_agg(jsonb_build_object('username', ap.username, 'is_owner', m.user_id = fg.owner_id, 'is_me', m.user_id = me, 'invited', m.status = 'invited') ORDER BY m.added_at), '[]'::jsonb)
                      FROM public.friend_group_members m LEFT JOIN public.account_preferences ap ON ap.user_id = m.user_id WHERE m.group_id = fg.id)
        ) ORDER BY fg.updated_at DESC)
        FROM public.friend_groups fg
        WHERE EXISTS (SELECT 1 FROM public.friend_group_members x WHERE x.group_id = fg.id AND x.user_id = me AND x.status = 'member')), '[]'::jsonb),
      'invites', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', fg.id, 'name', fg.name, 'owner', oap.username) ORDER BY x.added_at DESC)
        FROM public.friend_group_members x JOIN public.friend_groups fg ON fg.id = x.group_id
        LEFT JOIN public.account_preferences oap ON oap.user_id = fg.owner_id
        WHERE x.user_id = me AND x.status = 'invited'), '[]'::jsonb));
  ELSIF p_action = 'accept_invite' THEN
    UPDATE public.friend_group_members SET status = 'member' WHERE group_id = p_group AND user_id = me AND status = 'invited';
    IF FOUND THEN UPDATE public.friend_groups SET updated_at = now() WHERE id = p_group; END IF;
    RETURN jsonb_build_object('ok', FOUND);
  ELSIF p_action = 'decline_invite' THEN
    DELETE FROM public.friend_group_members WHERE group_id = p_group AND user_id = me AND status = 'invited';
    RETURN jsonb_build_object('ok', FOUND);
  END IF;
  SELECT * INTO g FROM public.friend_groups WHERE id = p_group FOR UPDATE;
  IF NOT FOUND OR g.owner_id <> me THEN RETURN jsonb_build_object('ok', false, 'error', 'not_allowed'); END IF;
  IF p_action IN ('add', 'remove') THEN
    SELECT user_id, is_private INTO target, target_private FROM public.account_preferences WHERE lower(username) = lower(trim(p_username)) AND completed;
    IF target IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  END IF;
  IF p_action = 'add' THEN
    IF EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id = g.id AND user_id = target) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_member');
    END IF;
    IF (SELECT count(*) FROM public.friend_group_members WHERE group_id = g.id) >= 10 THEN RETURN jsonb_build_object('ok', false, 'error', 'full'); END IF;
    is_friend := EXISTS (SELECT 1 FROM public.friendships WHERE status = 'accepted'
      AND LEAST(requester_id, addressee_id) = LEAST(me, target) AND GREATEST(requester_id, addressee_id) = GREATEST(me, target));
    new_status := CASE WHEN target_private AND NOT is_friend THEN 'invited' ELSE 'member' END;
    INSERT INTO public.friend_group_members (group_id, user_id, status) VALUES (g.id, target, new_status);
    SELECT username INTO my_name FROM public.account_preferences WHERE user_id = me;
    INSERT INTO public.notifications (user_id, kind, actor_username, detail)
      VALUES (target, CASE WHEN new_status = 'invited' THEN 'group_invite' ELSE 'group_added' END, my_name, g.name);
    UPDATE public.friend_groups SET updated_at = now() WHERE id = g.id;
    RETURN jsonb_build_object('ok', true, 'result', new_status);
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
REVOKE ALL ON FUNCTION public.friend_action(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.friend_action(text, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.group_action(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_action(text, uuid, text, text) TO authenticated;