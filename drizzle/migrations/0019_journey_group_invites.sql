CREATE OR REPLACE FUNCTION public.invite_group_to_journey(p_group uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); my_name text; n integer;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id = p_group AND user_id = me AND status = 'member') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_allowed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parties WHERE code = upper(p_code)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_journey');
  END IF;
  SELECT username INTO my_name FROM public.account_preferences WHERE user_id = me;
  INSERT INTO public.notifications (user_id, kind, actor_username, detail)
    SELECT m.user_id, 'journey_invite', my_name, upper(p_code)
    FROM public.friend_group_members m WHERE m.group_id = p_group AND m.status = 'member' AND m.user_id <> me;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.friend_groups SET updated_at = now() WHERE id = p_group;
  RETURN jsonb_build_object('ok', true, 'invited', n);
END $$;
REVOKE ALL ON FUNCTION public.invite_group_to_journey(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_group_to_journey(uuid, text) TO authenticated;