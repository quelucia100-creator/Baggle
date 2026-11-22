CREATE OR REPLACE FUNCTION public.group_weekly_action(p_action text, p_group uuid, p_weekday integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE me uuid := auth.uid(); group_name text; openings jsonb; cooldown boolean; actor text;
  weekday_names text[] := ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('read','poke') THEN RAISE EXCEPTION 'bad_action'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id=p_group AND user_id=me AND status='member') THEN
    RETURN jsonb_build_object('ok',false,'error','not_allowed');
  END IF;
  SELECT name INTO group_name FROM public.friend_groups WHERE id=p_group FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id=p_group AND user_id=me AND status='member') THEN
    RETURN jsonb_build_object('ok',false,'error','not_allowed');
  END IF;
  WITH members AS (
    SELECT user_id FROM public.friend_group_members WHERE group_id=p_group AND status='member'
  ), common_slots AS (
    SELECT d.weekday, s.slot
    FROM generate_series(1,7) d(weekday) CROSS JOIN generate_series(0,59) s(slot)
    WHERE (SELECT count(*) FROM members) >= 2 AND NOT EXISTS (
      SELECT 1 FROM members m LEFT JOIN public.account_weekly_availability a ON a.user_id=m.user_id AND a.weekday=d.weekday
      WHERE a.user_id IS NULL OR NOT a.confirmed OR s.slot=ANY(a.busy_slots)
    )
  ), islands AS (
    SELECT weekday, slot, slot-row_number() OVER (PARTITION BY weekday ORDER BY slot) AS island FROM common_slots
  ), windows AS (
    SELECT weekday, min(slot) AS start_slot, max(slot)+1 AS end_slot FROM islands GROUP BY weekday,island
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('weekday',weekday,'startSlot',start_slot,'endSlot',end_slot) ORDER BY weekday,start_slot),'[]'::jsonb) INTO openings FROM windows;
  SELECT EXISTS(SELECT 1 FROM public.group_hangout_pokes WHERE group_id=p_group AND last_sent_at > now()-interval '1 hour') INTO cooldown;
  IF p_action='read' THEN RETURN jsonb_build_object('ok',true,'openings',openings,'canPoke',NOT cooldown); END IF;
  IF p_weekday IS NULL OR p_weekday NOT BETWEEN 1 AND 7 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(openings) o WHERE (o->>'weekday')::integer=p_weekday) THEN
    RETURN jsonb_build_object('ok',false,'error','no_opening');
  END IF;
  IF cooldown THEN RETURN jsonb_build_object('ok',false,'error','cooldown'); END IF;
  INSERT INTO public.group_hangout_pokes(group_id,last_sent_at) VALUES(p_group,now()) ON CONFLICT(group_id) DO UPDATE SET last_sent_at=excluded.last_sent_at;
  SELECT username INTO actor FROM public.account_preferences WHERE user_id=me;
  INSERT INTO public.notifications(user_id,kind,actor_username,detail)
    SELECT user_id,'group_poke',actor,group_name || ' · ' || weekday_names[p_weekday]
    FROM public.friend_group_members WHERE group_id=p_group AND status='member' AND user_id<>me;
  RETURN jsonb_build_object('ok',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.group_weekly_action(text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.group_weekly_action(text,uuid,integer) TO authenticated,service_role;