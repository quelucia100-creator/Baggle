CREATE OR REPLACE FUNCTION public.party_plan_public_option(o jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
SELECT CASE WHEN o IS NULL OR jsonb_typeof(o)<>'object' THEN NULL ELSE jsonb_build_object(
 'venue', jsonb_build_object('placeId',o#>'{venue,placeId}','name',o#>'{venue,name}','category',o#>'{venue,category}','priceTier',o#>'{venue,priceTier}','location',o#>'{venue,location}','mapsUrl',o#>'{venue,mapsUrl}','outdoor',o#>'{venue,outdoor}'),
 'startAt',o->'startAt','endAt',o->'endAt','hoursUnknown',o->'hoursUnknown','weather',o->'weather',
 'compromise', to_jsonb(CASE
   WHEN o->>'compromise' ~* '(budget|travel|cost)' AND o->>'compromise' ~* 'uncomfortable' THEN 'Some trade-offs on cost or travel · Outdoor conditions may be uncomfortable'
   WHEN o->>'compromise' ~* '(budget|travel|cost)' THEN 'Some trade-offs on cost or travel'
   WHEN o->>'compromise' ~* 'uncomfortable' THEN 'Outdoor conditions may be uncomfortable'
   ELSE 'Works for everyone' END)) END $$;
REVOKE ALL ON FUNCTION public.party_plan_public_option(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.party_plan(p_action text, p_code text, p_token text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_access jsonb; v_party uuid; v_self public.party_members; v_state public.party_planning; v_pref jsonb; v_ready jsonb; v_count integer; v_votes integer; v_acquired boolean := false; v_lease uuid; v_lat numeric; v_lng numeric;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('read','save','configure','begin_lock','vote','host_reroll','finalize','reopen') THEN RAISE EXCEPTION 'Invalid planning action'; END IF;
 v_access := public.party_access('read',p_code,p_token);
 SELECT id INTO v_party FROM public.parties WHERE code=v_access->>'code' FOR UPDATE;
 SELECT * INTO v_self FROM public.party_members WHERE id=(v_access->>'selfId')::uuid;
 INSERT INTO public.party_planning(party_id) VALUES(v_party) ON CONFLICT DO NOTHING;
 SELECT * INTO v_state FROM public.party_planning WHERE party_id=v_party FOR UPDATE;
 IF p_action IN ('configure','begin_lock','host_reroll','finalize','reopen') AND NOT v_self.is_host THEN RAISE EXCEPTION 'Only the host can manage planning.'; END IF;
 IF p_action='save' THEN
  IF v_state.status <> 'collecting' THEN RAISE EXCEPTION 'Preferences are frozen until the host reopens planning.'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR NOT (p_payload ?& ARRAY['budget','freeFrom','freeTo','maxTravelMin']) THEN RAISE EXCEPTION 'Complete all planning preferences.'; END IF;
  IF (p_payload->>'budget') IS NULL OR (p_payload->>'maxTravelMin') IS NULL OR (p_payload->>'freeFrom') IS NULL OR (p_payload->>'freeTo') IS NULL OR p_payload->>'freeFrom' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR p_payload->>'freeTo' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Invalid planning preferences.'; END IF;
  v_lat := (p_payload->>'originLat')::numeric; v_lng := (p_payload->>'originLng')::numeric;
  IF (v_lat IS NULL) <> (v_lng IS NULL) OR (v_lat IS NOT NULL AND (v_lat NOT BETWEEN -90 AND 90 OR v_lng NOT BETWEEN -180 AND 180)) THEN RAISE EXCEPTION 'Invalid rough origin.'; END IF;
  INSERT INTO public.party_preferences(member_id,budget,free_from,free_to,max_travel_min,origin_lat,origin_lng) VALUES(v_self.id,(p_payload->>'budget')::integer,(p_payload->>'freeFrom')::time,(p_payload->>'freeTo')::time,(p_payload->>'maxTravelMin')::integer,round(v_lat,2),round(v_lng,2))
  ON CONFLICT(member_id) DO UPDATE SET budget=excluded.budget,free_from=excluded.free_from,free_to=excluded.free_to,max_travel_min=excluded.max_travel_min,origin_lat=excluded.origin_lat,origin_lng=excluded.origin_lng,submitted_at=now();
 ELSIF p_action='configure' THEN
  IF v_state.status <> 'collecting' THEN RAISE EXCEPTION 'Planning configuration is frozen.'; END IF;
  IF p_payload IS NULL OR NOT (p_payload ?& ARRAY['date','durationMin','areaLabel','areaLat','areaLng','category']) OR length(trim(coalesce(p_payload->>'areaLabel',''))) NOT BETWEEN 1 AND 80 OR p_payload->>'category' NOT IN ('park','cafe','museum','restaurant','activity') OR (p_payload->>'category') IS NULL THEN RAISE EXCEPTION 'Invalid planning configuration.'; END IF;
  IF (p_payload->>'date') IS NULL OR (p_payload->>'date')::date NOT BETWEEN (now() AT TIME ZONE 'America/Montreal')::date AND (now() AT TIME ZONE 'America/Montreal')::date + 14 THEN RAISE EXCEPTION 'Choose a date in the next 14 days.'; END IF;
  UPDATE public.party_planning SET event_date=(p_payload->>'date')::date,duration_min=(p_payload->>'durationMin')::integer,area_label=trim(p_payload->>'areaLabel'),area_lat=(p_payload->>'areaLat')::double precision,area_lng=(p_payload->>'areaLng')::double precision,category=p_payload->>'category' WHERE party_id=v_party;
 ELSIF p_action='begin_lock' THEN
  IF v_state.status='collecting' OR (v_state.status='locking' AND v_state.lock_started_at < now()-interval '30 seconds') THEN
   SELECT count(*) INTO v_count FROM public.party_preferences p JOIN public.party_members m ON m.id=p.member_id WHERE m.party_id=v_party AND NOT m.removed;
   IF v_count < 2 THEN RAISE EXCEPTION 'At least 2 members must submit before locking.'; END IF;
   v_lease := gen_random_uuid(); v_acquired := true;
   UPDATE public.party_planning SET status='locking',lock_id=v_lease,lock_started_at=now(),revision=revision+1,lock_snapshot=jsonb_build_object('config',jsonb_build_object('date',event_date,'durationMin',duration_min,'areaLabel',area_label,'area',jsonb_build_object('lat',area_lat,'lng',area_lng),'category',category),'members',(SELECT jsonb_agg(jsonb_build_object('id',m.id,'budget',p.budget,'freeFrom',to_char(p.free_from,'HH24:MI'),'freeTo',to_char(p.free_to,'HH24:MI'),'maxTravelMin',p.max_travel_min,'origin',CASE WHEN p.origin_lat IS NOT NULL THEN jsonb_build_object('lat',p.origin_lat,'lng',p.origin_lng) ELSE NULL END) ORDER BY m.id) FROM public.party_preferences p JOIN public.party_members m ON m.id=p.member_id WHERE m.party_id=v_party AND NOT m.removed)),participants=ARRAY(SELECT m.id FROM public.party_members m JOIN public.party_preferences p ON p.member_id=m.id WHERE m.party_id=v_party AND NOT m.removed),outliers='{}',options='[]',plan_index=0,group_rerolls_used=0 WHERE party_id=v_party;
  ELSIF v_state.status='no_plan' THEN RAISE EXCEPTION 'Reopen planning before trying again.';
  END IF;
 ELSIF p_action IN ('vote','host_reroll') THEN
  IF v_state.status <> 'locked' THEN RAISE EXCEPTION 'There is no open plan to reroll.'; END IF;
  IF (p_payload->>'revision')::integer IS DISTINCT FROM v_state.revision THEN RAISE EXCEPTION 'This plan changed. Refresh and try again.'; END IF;
  IF v_state.plan_index+1 >= jsonb_array_length(v_state.options) THEN RAISE EXCEPTION 'Last option: there are no more plans.'; END IF;
  IF p_action='vote' THEN
   IF NOT (v_self.id=ANY(v_state.participants)) THEN RAISE EXCEPTION 'Submit preferences before voting.'; END IF;
   IF v_state.group_rerolls_used >= 3 THEN RAISE EXCEPTION 'Only the host can reroll now.'; END IF;
   INSERT INTO public.party_reroll_votes VALUES(v_party,v_self.id,v_state.revision) ON CONFLICT DO NOTHING;
   SELECT count(*) INTO v_count FROM public.party_members WHERE party_id=v_party AND NOT removed AND id=ANY(v_state.participants);
   SELECT count(*) INTO v_votes FROM public.party_reroll_votes r JOIN public.party_members m ON m.id=r.member_id WHERE r.party_id=v_party AND r.revision=v_state.revision AND NOT m.removed;
  END IF;
  IF p_action='host_reroll' OR v_votes >= ceil(v_count/2.0) THEN
   UPDATE public.party_planning SET plan_index=plan_index+1,revision=revision+1,group_rerolls_used=least(3,group_rerolls_used+1) WHERE party_id=v_party;
  END IF;
 ELSIF p_action='finalize' THEN
  IF v_state.status NOT IN ('locked','final') THEN RAISE EXCEPTION 'Only a locked plan can be finalized.'; END IF;
  UPDATE public.party_planning SET status='final' WHERE party_id=v_party;
 ELSIF p_action='reopen' THEN
  IF v_state.status <> 'no_plan' THEN RAISE EXCEPTION 'Only a no-plan result can be reopened.'; END IF;
  UPDATE public.party_planning SET status='collecting',revision=revision+1,options='[]',outliers='{}',lock_id=NULL,lock_snapshot=NULL,participants='{}' WHERE party_id=v_party;
 END IF;
 SELECT * INTO v_state FROM public.party_planning WHERE party_id=v_party;
 SELECT jsonb_build_object('budget',budget,'freeFrom',to_char(free_from,'HH24:MI'),'freeTo',to_char(free_to,'HH24:MI'),'maxTravelMin',max_travel_min,'originLat',origin_lat,'originLng',origin_lng) INTO v_pref FROM public.party_preferences WHERE member_id=v_self.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'submitted',p.member_id IS NOT NULL) ORDER BY m.joined_at,m.id),'[]') INTO v_ready FROM public.party_members m LEFT JOIN public.party_preferences p ON p.member_id=m.id WHERE m.party_id=v_party AND NOT m.removed;
 SELECT count(*) INTO v_count FROM public.party_members WHERE party_id=v_party AND NOT removed AND id=ANY(v_state.participants);
 SELECT count(*) INTO v_votes FROM public.party_reroll_votes r JOIN public.party_members m ON m.id=r.member_id WHERE r.party_id=v_party AND r.revision=v_state.revision AND NOT m.removed;
 RETURN jsonb_build_object('status',v_state.status,'revision',v_state.revision,'selfPreferences',v_pref,'members',v_ready,'config',jsonb_build_object('date',v_state.event_date,'durationMin',v_state.duration_min,'areaLabel',v_state.area_label,'area',jsonb_build_object('lat',v_state.area_lat,'lng',v_state.area_lng),'category',v_state.category),'plan',public.party_plan_public_option(v_state.options->v_state.plan_index),'planIndex',v_state.plan_index,'optionCount',jsonb_array_length(v_state.options),'groupRerollsUsed',v_state.group_rerolls_used,'votes',v_votes,'voteThreshold',ceil(v_count/2.0),'selfVoted',EXISTS(SELECT 1 FROM public.party_reroll_votes WHERE party_id=v_party AND member_id=v_self.id AND revision=v_state.revision),'noPlanReason',CASE WHEN v_state.status<>'no_plan' THEN NULL WHEN cardinality(v_state.outliers)>0 THEN 'no_overlap' ELSE 'no_venue_or_slot' END,'venueSource',v_state.venue_source)
 || CASE WHEN p_action='begin_lock' THEN jsonb_build_object('acquired',v_acquired,'lease',v_lease) ELSE '{}'::jsonb END;
END; $function$;

CREATE OR REPLACE FUNCTION public.party_plan_complete(p_code text, p_lease uuid, p_options jsonb DEFAULT '[]'::jsonb, p_outliers uuid[] DEFAULT '{}'::uuid[], p_source text DEFAULT 'fallback'::text, p_failed boolean DEFAULT false)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_party uuid; v_state public.party_planning; v_clean jsonb;
BEGIN
 SELECT id INTO v_party FROM public.parties WHERE code=upper(p_code) FOR UPDATE;
 SELECT * INTO v_state FROM public.party_planning WHERE party_id=v_party FOR UPDATE;
 IF v_state.status IS DISTINCT FROM 'locking' OR v_state.lock_id IS DISTINCT FROM p_lease OR v_state.lock_started_at <= now()-interval '30 seconds' THEN RETURN false; END IF;
 IF p_options IS NULL OR jsonb_typeof(p_options) <> 'array' OR jsonb_array_length(p_options)>20 OR p_outliers IS NULL OR NOT (p_outliers <@ v_state.participants) THEN RAISE EXCEPTION 'Invalid planning result.'; END IF;
 SELECT coalesce(jsonb_agg(public.party_plan_public_option(e) ORDER BY n),'[]'::jsonb) INTO v_clean FROM jsonb_array_elements(p_options) WITH ORDINALITY AS t(e,n);
 UPDATE public.party_planning SET status=CASE WHEN p_failed THEN 'collecting' WHEN jsonb_array_length(v_clean)=0 THEN 'no_plan' ELSE 'locked' END,options=CASE WHEN p_failed THEN '[]'::jsonb ELSE v_clean END,outliers=CASE WHEN p_failed THEN '{}'::uuid[] ELSE p_outliers END,lock_snapshot=NULL,lock_id=NULL,venue_source=p_source WHERE party_id=v_party;
 UPDATE public.party_preferences SET origin_lat=NULL,origin_lng=NULL WHERE member_id=ANY(v_state.participants) AND NOT p_failed;
 RETURN true;
END; $function$;