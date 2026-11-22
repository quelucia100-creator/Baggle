CREATE OR REPLACE FUNCTION public.party_v3_prefs(p jsonb, c jsonb, p_strict boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_liked jsonb; v_excl jsonb; b jsonb; v_pmin integer; v_pmax integer; v_hard numeric; v_unl boolean;
  av jsonb; v_amode text; v_tonight jsonb := NULL; v_days jsonb := '[]'::jsonb; v_submitted boolean := true;
  t jsonb; v_any boolean; v_nod boolean; v_e timestamptz; v_l timestamptz; ws timestamptz; we timestamptz;
  v_cand date[]; v_seen date[] := '{}'; e jsonb; bi jsonb; dd date; conf boolean; s timestamptz; f timestamptz; mr tstzmultirange; v_sum interval;
  gb tstzmultirange := '{}'; fr tstzmultirange; v_need interval; v_feasible boolean := false; x tstzrange;
  o jsonb; v_src text; v_acc text; v_olabel text := NULL; v_lat numeric := NULL; v_lng numeric := NULL; v_exp timestamptz := NULL;
  tv jsonb; v_note text := NULL; v_ret text := NULL; v_at boolean;
BEGIN
  IF NOT public.party_v3_keys(p, ARRAY['version','vibes','likedActivities','excludedActivities','budget','availability','origin','travel','accessibilityHardRequirements','dietaryHardRequirements','optionalNote'])
     OR p->'version' IS DISTINCT FROM '3'::jsonb OR c IS NULL THEN RAISE EXCEPTION 'invalid'; END IF;
  v_liked := public.party_v3_enum_set(p->'likedActivities', ARRAY['food_cafes','games','sports','outdoors','arts_culture','entertainment','nightlife','surprise'], 0, 8);
  v_excl := public.party_v3_enum_set(p->'excludedActivities', ARRAY['food_cafes','games','sports','outdoors','arts_culture','entertainment','nightlife'], 0, 7);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_liked) y WHERE v_excl ? y) THEN RAISE EXCEPTION 'invalid'; END IF;

  b := p->'budget';
  IF NOT public.party_v3_keys(b, ARRAY['currency','preferredMinCad','preferredMaxCad','hardMaxCad','explicitlyUnlimited']) OR b->'currency' IS DISTINCT FROM '"CAD"'::jsonb THEN RAISE EXCEPTION 'invalid'; END IF;
  v_pmin := public.party_v3_int(b->'preferredMinCad', 0, 500, 5); v_pmax := public.party_v3_int(b->'preferredMaxCad', 0, 500, 5);
  v_unl := public.party_v3_bool(b->'explicitlyUnlimited');
  IF v_pmin > v_pmax THEN RAISE EXCEPTION 'invalid'; END IF;
  IF v_unl THEN
    IF jsonb_typeof(b->'hardMaxCad') <> 'null' THEN RAISE EXCEPTION 'invalid'; END IF;
  ELSE
    v_hard := public.party_v3_num(b->'hardMaxCad', 0, 'Infinity'::numeric);
    IF v_hard < v_pmax THEN RAISE EXCEPTION 'invalid'; END IF;
  END IF;

  v_need := make_interval(mins => (c#>>'{duration,minMinutes}')::integer);
  av := p->'availability';
  IF NOT public.party_v3_keys(av, ARRAY['mode','tonight','days']) THEN RAISE EXCEPTION 'invalid'; END IF;
  v_amode := public.party_v3_enum(av->'mode', ARRAY['tonight','calendar']);
  v_cand := ARRAY(SELECT y::date FROM jsonb_array_elements_text(c#>'{dateSelection,candidateDates}') y ORDER BY y);
  IF (c#>>'{dateSelection,mode}' = 'today_tonight') <> (v_amode = 'tonight') THEN RAISE EXCEPTION 'invalid'; END IF;
  IF v_amode = 'tonight' THEN
    t := av->'tonight';
    IF jsonb_typeof(av->'days') <> 'array' OR jsonb_array_length(av->'days') <> 0 OR NOT public.party_v3_keys(t, ARRAY['earliestDepartureAt','latestReturnAt','anytimeFromNow','noReturnDeadline']) THEN RAISE EXCEPTION 'invalid'; END IF;
    ws := (v_cand[1]::timestamp) AT TIME ZONE 'America/Montreal';
    we := ((v_cand[1] + 1)::timestamp + interval '6 hours') AT TIME ZONE 'America/Montreal';
    v_any := public.party_v3_bool(t->'anytimeFromNow'); v_nod := public.party_v3_bool(t->'noReturnDeadline');
    IF v_any THEN
      IF jsonb_typeof(t->'earliestDepartureAt') <> 'null' THEN RAISE EXCEPTION 'invalid'; END IF;
    ELSE
      v_e := public.party_v3_ts(t->'earliestDepartureAt');
      -- minute grid; before that day's local midnight; may be earlier than now (remaining time checked below)
      IF NOT public.party_v3_minute_ok(v_e) OR v_e < ws OR v_e >= ((v_cand[1] + 1)::timestamp) AT TIME ZONE 'America/Montreal' THEN RAISE EXCEPTION 'invalid'; END IF;
    END IF;
    IF v_nod THEN
      IF jsonb_typeof(t->'latestReturnAt') <> 'null' THEN RAISE EXCEPTION 'invalid'; END IF;
    ELSE
      v_l := public.party_v3_ts(t->'latestReturnAt');
      IF NOT public.party_v3_minute_ok(v_l) OR v_l <= (v_cand[1]::timestamp + interval '6 hours') AT TIME ZONE 'America/Montreal' OR v_l > we
         OR v_l <= coalesce(v_e, ws) THEN RAISE EXCEPTION 'invalid'; END IF;
    END IF;
    IF p_strict THEN
      x := tstzrange(greatest(coalesce(v_e, ws), now()), greatest(coalesce(v_l, we), greatest(coalesce(v_e, ws), now())), '[)');
      v_feasible := NOT isempty(x) AND upper(x) - lower(x) >= v_need;
    END IF;
    v_tonight := jsonb_build_object('earliestDepartureAt', CASE WHEN v_any THEN NULL ELSE public.party_v3_iso(v_e) END,
      'latestReturnAt', CASE WHEN v_nod THEN NULL ELSE public.party_v3_iso(v_l) END, 'anytimeFromNow', v_any, 'noReturnDeadline', v_nod);
  ELSE
    IF jsonb_typeof(av->'tonight') <> 'null' OR jsonb_typeof(av->'days') <> 'array' OR jsonb_array_length(av->'days') <> cardinality(v_cand) THEN RAISE EXCEPTION 'invalid'; END IF;
    FOR e IN SELECT value FROM jsonb_array_elements(av->'days') LOOP
      IF NOT public.party_v3_keys(e, ARRAY['date','confirmed','busyIntervals']) OR jsonb_typeof(e->'busyIntervals') <> 'array' OR jsonb_array_length(e->'busyIntervals') > 64 THEN RAISE EXCEPTION 'invalid'; END IF;
      dd := public.party_v3_date(e->'date');
      IF NOT (dd = ANY(v_cand)) OR dd = ANY(v_seen) THEN RAISE EXCEPTION 'invalid'; END IF;
      v_seen := v_seen || dd;
      conf := public.party_v3_bool(e->'confirmed');
      ws := (dd::timestamp) AT TIME ZONE 'America/Montreal';
      we := ((dd + 1)::timestamp + interval '6 hours') AT TIME ZONE 'America/Montreal';
      mr := '{}'::tstzmultirange; v_sum := interval '0';
      FOR bi IN SELECT value FROM jsonb_array_elements(e->'busyIntervals') LOOP
        IF NOT public.party_v3_keys(bi, ARRAY['startAt','endAt']) THEN RAISE EXCEPTION 'invalid'; END IF;
        s := public.party_v3_ts(bi->'startAt'); f := public.party_v3_ts(bi->'endAt');
        IF s >= f OR s < ws OR f > we OR NOT public.party_v3_slot_ok(s) OR NOT public.party_v3_slot_ok(f) THEN RAISE EXCEPTION 'invalid'; END IF;
        mr := mr + tstzmultirange(tstzrange(s, f, '[)')); v_sum := v_sum + (f - s);
      END LOOP;
      IF v_sum <> coalesce((SELECT sum(upper(r) - lower(r)) FROM unnest(mr) r), interval '0') THEN RAISE EXCEPTION 'invalid'; END IF;
      IF conf THEN gb := gb + mr; END IF;
      v_submitted := v_submitted AND conf;
      v_days := v_days || jsonb_build_array(jsonb_build_object('date', to_char(dd,'YYYY-MM-DD'), 'confirmed', conf,
        'busyIntervals', coalesce((SELECT jsonb_agg(jsonb_build_object('startAt', public.party_v3_iso(lower(r)), 'endAt', public.party_v3_iso(upper(r))) ORDER BY lower(r)) FROM unnest(mr) r), '[]'::jsonb)));
    END LOOP;
    v_days := (SELECT jsonb_agg(y ORDER BY y->>'date') FROM jsonb_array_elements(v_days) y);
    IF p_strict AND v_submitted THEN
      FOREACH dd IN ARRAY v_cand LOOP
        fr := (tstzmultirange(tstzrange((dd::timestamp) AT TIME ZONE 'America/Montreal', ((dd + 1)::timestamp + interval '6 hours') AT TIME ZONE 'America/Montreal', '[)')) - gb)
              * tstzmultirange(tstzrange(now(), NULL, '[)'));
        IF EXISTS (SELECT 1 FROM unnest(fr) r WHERE upper(r) - lower(r) >= v_need) THEN v_feasible := true; END IF;
      END LOOP;
    END IF;
  END IF;
  IF p_strict AND v_submitted AND NOT v_feasible THEN RAISE EXCEPTION 'invalid'; END IF;

  o := p->'origin';
  IF NOT public.party_v3_keys(o, ARRAY['source','label','lat','lng','accuracy']) THEN RAISE EXCEPTION 'invalid'; END IF;
  v_src := public.party_v3_enum(o->'source', ARRAY['current_location','manual','group_area']);
  v_acc := public.party_v3_enum(o->'accuracy', ARRAY['approximate','precise_ephemeral']);
  IF jsonb_typeof(o->'label') <> 'null' THEN v_olabel := public.party_v3_str(o->'label', 160); END IF;
  IF v_src = 'group_area' THEN
    IF c#>>'{area,mode}' <> 'host_area' OR jsonb_typeof(o->'lat') <> 'null' OR jsonb_typeof(o->'lng') <> 'null' OR v_acc <> 'approximate' THEN RAISE EXCEPTION 'invalid'; END IF;
  ELSE
    IF v_src = 'manual' AND v_olabel IS NULL THEN RAISE EXCEPTION 'invalid'; END IF;
    v_lat := public.party_v3_num(o->'lat', -90, 90); v_lng := public.party_v3_num(o->'lng', -180, 180);
    IF v_acc = 'precise_ephemeral' THEN
      IF v_src <> 'current_location' THEN RAISE EXCEPTION 'invalid'; END IF;
      v_exp := now() + interval '1 hour';
    ELSE
      v_lat := round(v_lat, 2); v_lng := round(v_lng, 2);
    END IF;
  END IF;

  tv := p->'travel';
  IF NOT public.party_v3_keys(tv, ARRAY['mode','maxOneWayMinutes','returnMode','alreadyAtSharedMeetingPoint']) THEN RAISE EXCEPTION 'invalid'; END IF;
  IF jsonb_typeof(tv->'returnMode') <> 'null' THEN v_ret := public.party_v3_enum(tv->'returnMode', ARRAY['walk','transit','drive','bike']); END IF;
  v_at := public.party_v3_bool(tv->'alreadyAtSharedMeetingPoint');
  IF v_at AND c#>>'{travelArrangement,mode}' <> 'together' THEN RAISE EXCEPTION 'invalid'; END IF;

  IF jsonb_typeof(p->'optionalNote') = 'string' THEN
    v_note := nullif(btrim(p->>'optionalNote'), '');
    IF length(v_note) > 500 OR v_note ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' THEN RAISE EXCEPTION 'invalid'; END IF;
  ELSIF jsonb_typeof(p->'optionalNote') <> 'null' THEN RAISE EXCEPTION 'invalid';
  END IF;

  RETURN jsonb_build_object('submitted', v_submitted, 'preciseExpiresAt', v_exp, 'doc', jsonb_build_object(
    'version', 3,
    'vibes', public.party_v3_enum_set(p->'vibes', ARRAY['chill_cozy','social_lively','adventurous','competitive','creative','surprise_me'], 1, 2),
    'likedActivities', v_liked, 'excludedActivities', v_excl,
    'budget', jsonb_build_object('currency','CAD','preferredMinCad',v_pmin,'preferredMaxCad',v_pmax,'hardMaxCad',v_hard,'explicitlyUnlimited',v_unl),
    'availability', jsonb_build_object('mode', v_amode, 'tonight', v_tonight, 'days', v_days),
    'origin', jsonb_build_object('source', v_src, 'label', v_olabel, 'lat', v_lat, 'lng', v_lng, 'accuracy', v_acc),
    'travel', jsonb_build_object('mode', public.party_v3_enum(tv->'mode', ARRAY['walk','transit','drive','bike']),
       'maxOneWayMinutes', public.party_v3_int(tv->'maxOneWayMinutes', 5, 90, 1), 'returnMode', v_ret, 'alreadyAtSharedMeetingPoint', v_at),
    'accessibilityHardRequirements', public.party_v3_tags(p->'accessibilityHardRequirements', 24),
    'dietaryHardRequirements', public.party_v3_tags(p->'dietaryHardRequirements', 24),
    'optionalNote', v_note));
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Invalid planning preferences.' USING ERRCODE = '22023';
END $function$;

CREATE OR REPLACE FUNCTION public.party_plan(p_action text, p_code text, p_token text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_access jsonb; v_party uuid; v_self public.party_members; v_state public.party_planning; v_pref jsonb; v_ready jsonb; v_count integer; v_votes integer; v_acquired boolean := false; v_lease uuid; v_lat numeric; v_lng numeric;
  v_v3 boolean; v_cfg jsonb; v_res jsonb; v_old public.party_preferences_v3; v_rev integer; v_plan jsonb; v_pver jsonb := NULL; v_obj boolean;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('read','save','configure','begin_lock','vote','host_reroll','finalize','reopen') THEN RAISE EXCEPTION 'Invalid planning action'; END IF;
 IF p_payload IS NOT NULL AND pg_column_size(p_payload) > 32768 THEN RAISE EXCEPTION 'Invalid planning request.'; END IF;
 v_access := public.party_access('read',p_code,p_token);
 SELECT id INTO v_party FROM public.parties WHERE code=v_access->>'code' FOR UPDATE;
 SELECT * INTO v_self FROM public.party_members WHERE id=(v_access->>'selfId')::uuid;
 INSERT INTO public.party_planning(party_id) VALUES(v_party) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM public.party_planning WHERE party_id=v_party FOR UPDATE;
 PERFORM public.party_v3_expire(v_party);
 SELECT * INTO v_state FROM public.party_planning WHERE party_id=v_party FOR UPDATE;
 v_v3 := v_state.schema_version = 3;
 v_obj := jsonb_typeof(p_payload) = 'object';
 IF p_action IN ('configure','begin_lock','host_reroll','finalize','reopen') AND NOT v_self.is_host THEN RAISE EXCEPTION 'Only the host can manage planning.'; END IF;

 IF p_action IN ('configure','save') AND v_obj AND p_payload ? 'version' THEN
  v_pver := p_payload->'version';
  IF v_pver IS DISTINCT FROM '3'::jsonb AND v_pver IS DISTINCT FROM '2'::jsonb THEN
   IF p_action='configure' THEN RAISE EXCEPTION 'Invalid planning configuration.'; ELSE RAISE EXCEPTION 'Invalid planning preferences.'; END IF;
  END IF;
  IF v_v3 AND p_action='configure' AND v_pver = '2'::jsonb THEN RAISE EXCEPTION 'Invalid planning configuration.'; END IF;
 END IF;
 IF v_v3 THEN
  IF p_action='configure' AND v_pver IS NULL THEN RAISE EXCEPTION 'Invalid planning configuration.'; END IF;
  IF p_action='save' AND NOT (public.party_v3_keys(p_payload, ARRAY['preferences','expectedRevision'])
      AND jsonb_typeof(p_payload->'expectedRevision')='number' AND (p_payload->>'expectedRevision') ~ '^[0-9]{1,10}$' AND (p_payload->>'expectedRevision')::numeric <= 2147483647) THEN RAISE EXCEPTION 'Invalid planning preferences.'; END IF;
  IF p_action IN ('begin_lock','reopen') AND NOT (public.party_v3_keys(p_payload, ARRAY['schemaVersion']) AND p_payload->'schemaVersion' = '3'::jsonb) THEN RAISE EXCEPTION 'Invalid planning request.'; END IF;
  IF p_action IN ('vote','host_reroll','finalize') AND NOT (public.party_v3_keys(p_payload, ARRAY['schemaVersion','revision']) AND p_payload->'schemaVersion' = '3'::jsonb
      AND jsonb_typeof(p_payload->'revision')='number' AND (p_payload->>'revision') ~ '^[0-9]{1,10}$' AND (p_payload->>'revision')::numeric <= 2147483647) THEN RAISE EXCEPTION 'Invalid planning request.'; END IF;
 ELSE
  IF v_obj AND (p_payload ? 'schemaVersion' OR p_payload ? 'preferences' OR p_payload ? 'expectedRevision'
       OR (p_payload ? 'version' AND NOT (p_action IN ('configure','save') AND v_pver = '2'::jsonb) AND NOT (p_action='configure' AND v_pver = '3'::jsonb))) THEN RAISE EXCEPTION 'Invalid planning request.'; END IF;
  IF p_action IN ('configure','save') AND v_pver = '2'::jsonb THEN p_payload := p_payload - 'version'; END IF;
 END IF;

 IF p_action='configure' AND (v_v3 OR v_pver = '3'::jsonb) THEN
  IF v_state.status <> 'collecting' THEN RAISE EXCEPTION 'Planning configuration is frozen.'; END IF;
  v_cfg := public.party_v3_config(p_payload);
  IF NOT v_v3 OR v_state.config_v3 IS DISTINCT FROM v_cfg THEN
   UPDATE public.party_planning SET schema_version=3,config_v3=v_cfg,revision=revision+1,options='[]',plan_index=0,group_rerolls_used=0,participants='{}',outliers='{}',lock_id=NULL,lock_snapshot=NULL,venue_source=NULL WHERE party_id=v_party;
   DELETE FROM public.party_reroll_votes WHERE party_id=v_party;
   UPDATE public.party_preferences_v3 SET submitted=false WHERE party_id=v_party AND submitted;
  END IF;
 ELSIF p_action='save' AND v_v3 THEN
  IF v_state.status <> 'collecting' THEN RAISE EXCEPTION 'Preferences are frozen until the host reopens planning.'; END IF;
  IF (p_payload->>'expectedRevision')::integer <> v_state.revision THEN RAISE EXCEPTION 'This plan changed. Refresh and try again.'; END IF;
  v_res := public.party_v3_prefs(p_payload->'preferences', v_state.config_v3, true);
  SELECT * INTO v_old FROM public.party_preferences_v3 WHERE member_id=v_self.id;
  IF v_old.member_id IS NULL OR v_old.preferences IS DISTINCT FROM v_res->'doc' OR v_old.submitted IS DISTINCT FROM (v_res->>'submitted')::boolean OR (v_old.precise_expires_at IS NULL) <> (v_res->>'preciseExpiresAt' IS NULL) THEN
   INSERT INTO public.party_preferences_v3(member_id,party_id,preferences,submitted,precise_expires_at,updated_at)
   VALUES(v_self.id,v_party,v_res->'doc',(v_res->>'submitted')::boolean,(v_res->>'preciseExpiresAt')::timestamptz,now())
   ON CONFLICT(member_id) DO UPDATE SET preferences=excluded.preferences,submitted=excluded.submitted,precise_expires_at=excluded.precise_expires_at,updated_at=excluded.updated_at;
  END IF;
 ELSIF p_action='begin_lock' AND v_v3 THEN
  IF v_state.status='collecting' OR (v_state.status='locking' AND v_state.lock_started_at < now()-interval '30 seconds') THEN
   IF NOT public.party_v3_anchor_open(v_state.config_v3, now()) THEN RAISE EXCEPTION 'Choose new dates before locking.'; END IF;
   IF NOT EXISTS (SELECT 1 FROM public.party_preferences_v3 WHERE member_id=v_self.id AND submitted) THEN RAISE EXCEPTION 'Submit your own preferences before locking.'; END IF;
   SELECT count(*) INTO v_count FROM public.party_preferences_v3 p JOIN public.party_members m ON m.id=p.member_id WHERE m.party_id=v_party AND NOT m.removed AND p.submitted;
   IF v_count < 2 THEN RAISE EXCEPTION 'At least 2 members must submit before locking.'; END IF;
   v_lease := gen_random_uuid(); v_acquired := true;
   UPDATE public.party_planning SET status='locking',lock_id=v_lease,lock_started_at=now(),revision=revision+1,
     lock_snapshot=jsonb_build_object('schemaVersion',3,'revision',v_state.revision+1,'config',config_v3,
       'members',(SELECT jsonb_agg(jsonb_build_object('id',m.id,'preferences',p.preferences) ORDER BY m.id) FROM public.party_preferences_v3 p JOIN public.party_members m ON m.id=p.member_id WHERE m.party_id=v_party AND NOT m.removed AND p.submitted)),
     participants=ARRAY(SELECT m.id FROM public.party_members m JOIN public.party_preferences_v3 p ON p.member_id=m.id WHERE m.party_id=v_party AND NOT m.removed AND p.submitted ORDER BY m.id),
     outliers='{}',options='[]',plan_index=0,group_rerolls_used=0,venue_source=NULL WHERE party_id=v_party;
   DELETE FROM public.party_reroll_votes WHERE party_id=v_party;
  ELSIF v_state.status='no_plan' THEN RAISE EXCEPTION 'Reopen planning before trying again.';
  END IF;
 ELSIF p_action='finalize' AND v_v3 THEN
  v_rev := (p_payload->>'revision')::integer;
  IF v_state.status='final' AND v_rev = v_state.revision THEN NULL;
  ELSIF v_state.status <> 'locked' THEN RAISE EXCEPTION 'Only a locked plan can be finalized.';
  ELSIF v_rev IS DISTINCT FROM v_state.revision THEN RAISE EXCEPTION 'This plan changed. Refresh and try again.';
  ELSE UPDATE public.party_planning SET status='final' WHERE party_id=v_party;
  END IF;
 ELSIF p_action='reopen' AND v_v3 THEN
  IF v_state.status <> 'no_plan' THEN RAISE EXCEPTION 'Only a no-plan result can be reopened.'; END IF;
  UPDATE public.party_planning SET status='collecting',revision=revision+1,options='[]',outliers='{}',lock_id=NULL,lock_snapshot=NULL,participants='{}',plan_index=0,group_rerolls_used=0,venue_source=NULL WHERE party_id=v_party;
  DELETE FROM public.party_reroll_votes WHERE party_id=v_party;
 -- ===== V2 (unchanged) =====
 ELSIF p_action='save' THEN
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
 SELECT count(*) INTO v_count FROM public.party_members WHERE party_id=v_party AND NOT removed AND id=ANY(v_state.participants);
 SELECT count(*) INTO v_votes FROM public.party_reroll_votes r JOIN public.party_members m ON m.id=r.member_id WHERE r.party_id=v_party AND r.revision=v_state.revision AND NOT m.removed;
 IF v_state.schema_version = 3 THEN
  SELECT public.party_v3_self_doc(preferences, v_state.config_v3) INTO v_pref FROM public.party_preferences_v3 WHERE member_id=v_self.id;
  IF v_state.status IN ('locking','locked','final') THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'submitted',m.id = ANY(v_state.participants)) ORDER BY m.joined_at,m.id),'[]') INTO v_ready FROM public.party_members m WHERE m.party_id=v_party AND NOT m.removed;
  ELSE
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'submitted',coalesce(p.submitted,false)) ORDER BY m.joined_at,m.id),'[]') INTO v_ready FROM public.party_members m LEFT JOIN public.party_preferences_v3 p ON p.member_id=m.id WHERE m.party_id=v_party AND NOT m.removed;
  END IF;
  v_plan := NULL;
  IF v_state.status IN ('locked','final') THEN
   BEGIN v_plan := public.party_plan_public_option_v3(v_state.options->v_state.plan_index, v_state.config_v3); EXCEPTION WHEN OTHERS THEN v_plan := NULL; END;
  END IF;
  RETURN jsonb_build_object('schemaVersion',3,'status',v_state.status,'revision',v_state.revision,'config',v_state.config_v3,'plan',v_plan,'selfPreferences',v_pref,'members',v_ready,'planIndex',v_state.plan_index,'optionCount',jsonb_array_length(v_state.options),'groupRerollsUsed',v_state.group_rerolls_used,'votes',v_votes,'voteThreshold',ceil(v_count/2.0),'selfVoted',EXISTS(SELECT 1 FROM public.party_reroll_votes WHERE party_id=v_party AND member_id=v_self.id AND revision=v_state.revision),'noPlanReason',CASE WHEN v_state.status='no_plan' THEN 'no_match' ELSE NULL END,'venueSource',CASE WHEN v_state.status IN ('locked','final') AND v_state.venue_source='curated' THEN 'curated' ELSE NULL END)
   || CASE WHEN p_action='begin_lock' THEN jsonb_build_object('acquired',v_acquired,'lease',v_lease) ELSE '{}'::jsonb END;
 END IF;
 SELECT jsonb_build_object('budget',budget,'freeFrom',to_char(free_from,'HH24:MI'),'freeTo',to_char(free_to,'HH24:MI'),'maxTravelMin',max_travel_min,'originLat',origin_lat,'originLng',origin_lng) INTO v_pref FROM public.party_preferences WHERE member_id=v_self.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'submitted',p.member_id IS NOT NULL) ORDER BY m.joined_at,m.id),'[]') INTO v_ready FROM public.party_members m LEFT JOIN public.party_preferences p ON p.member_id=m.id WHERE m.party_id=v_party AND NOT m.removed;
 RETURN jsonb_build_object('schemaVersion',2,'status',v_state.status,'revision',v_state.revision,'selfPreferences',v_pref,'members',v_ready,'config',jsonb_build_object('date',v_state.event_date,'durationMin',v_state.duration_min,'areaLabel',v_state.area_label,'area',jsonb_build_object('lat',v_state.area_lat,'lng',v_state.area_lng),'category',v_state.category),'plan',public.party_plan_public_option(v_state.options->v_state.plan_index),'planIndex',v_state.plan_index,'optionCount',jsonb_array_length(v_state.options),'groupRerollsUsed',v_state.group_rerolls_used,'votes',v_votes,'voteThreshold',ceil(v_count/2.0),'selfVoted',EXISTS(SELECT 1 FROM public.party_reroll_votes WHERE party_id=v_party AND member_id=v_self.id AND revision=v_state.revision),'noPlanReason',CASE WHEN v_state.status='no_plan' THEN 'no_match' ELSE NULL END,'venueSource',v_state.venue_source)
 || CASE WHEN p_action='begin_lock' THEN jsonb_build_object('acquired',v_acquired,'lease',v_lease) ELSE '{}'::jsonb END;
END; $function$;

REVOKE ALL ON FUNCTION public.party_v3_prefs(jsonb,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.party_v3_prefs(jsonb,jsonb,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.party_plan(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.party_plan(text,text,text,jsonb) TO anon, authenticated, service_role;