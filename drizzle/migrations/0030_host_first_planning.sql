-- REVIEW ONLY: intended managed migration 0030_host_first_planning.
-- Static definitions; no runtime source rewriting. Apply only after independent replay/review.
DO $preflight$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('party_access','ad4d5ea2ce0abde1b6170bb430da59eb'),
    ('party_plan','cbbc6aa9a134c497b5d62af753eb04bb'),
    ('party_plan_snapshot','c85152cf55d7a6e28b8b783ee73f7d96'),
    ('party_plan_complete','d1a77b7f4e486714043e119c0dbbcaec'),
    ('party_v3_prefs','1ea45608ee20a1e0cb8f7fa16d25f0fa')
  ) AS baseline(function_name, expected_md5) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
      AND p.proname=r.function_name AND md5(pg_get_functiondef(p.oid))=r.expected_md5) THEN
      RAISE EXCEPTION '0030 baseline function mismatch: %', r.function_name USING ERRCODE='55000';
    END IF;
  END LOOP;
  IF to_regprocedure('public.party_plan_days(text,text,text,jsonb)') IS NOT NULL
     OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.party_planning'::regclass AND attname='candidate_dates' AND NOT attisdropped) THEN
    RAISE EXCEPTION '0030 requires the unchanged 0029 baseline.' USING ERRCODE='55000';
  END IF;
END $preflight$;

ALTER TABLE public.party_planning ADD COLUMN candidate_dates date[] NOT NULL DEFAULT '{}'::date[]
  CHECK (cardinality(candidate_dates) <= 7 AND array_position(candidate_dates,NULL) IS NULL);
-- Existing complete V2 rows retain readiness; invalidated base answers are caller-only drafts.
ALTER TABLE public.party_preferences ADD COLUMN confirmed boolean NOT NULL DEFAULT true;
CREATE TABLE public.party_preference_days (
  member_id uuid PRIMARY KEY REFERENCES public.party_members(id) ON DELETE CASCADE,
  candidate_dates date[] NOT NULL CHECK (cardinality(candidate_dates) BETWEEN 1 AND 7 AND array_position(candidate_dates,NULL) IS NULL),
  windows jsonb NOT NULL CHECK (jsonb_typeof(windows)='object' AND windows <> '{}'::jsonb),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.party_preference_days TO service_role;
REVOKE ALL ON TABLE public.party_preference_days FROM PUBLIC, anon, authenticated;
ALTER TABLE public.party_preference_days ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.party_preference_days IS 'Caller-only V2 windows, scoped to an exact candidate-date array. Confirmation is authoritative only on party_preferences; no client table grants or realtime publication.';

CREATE OR REPLACE FUNCTION public.party_v2_preferences(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $v2prefs$
DECLARE v_budget integer; v_travel integer; v_lat numeric; v_lng numeric;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p) AS keys(key)
             WHERE key <> ALL(ARRAY['budget','freeFrom','freeTo','maxTravelMin','originLat','originLng','version']))
     OR NOT (p ?& ARRAY['budget','freeFrom','freeTo','maxTravelMin'])
     OR (p ? 'version' AND p->'version' IS DISTINCT FROM '2'::jsonb) THEN RAISE EXCEPTION 'invalid'; END IF;
  v_budget:=public.party_v3_int(p->'budget',0,4,1);
  v_travel:=public.party_v3_int(p->'maxTravelMin',5,90,1);
  IF jsonb_typeof(p->'freeFrom') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'freeTo') IS DISTINCT FROM 'string'
     OR p->>'freeFrom' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     OR p->>'freeTo' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'invalid'; END IF;
  IF p->'originLat' IS NOT NULL AND p->'originLat' <> 'null'::jsonb THEN v_lat:=public.party_v3_num(p->'originLat',-90,90); END IF;
  IF p->'originLng' IS NOT NULL AND p->'originLng' <> 'null'::jsonb THEN v_lng:=public.party_v3_num(p->'originLng',-180,180); END IF;
  IF (v_lat IS NULL) <> (v_lng IS NULL) THEN RAISE EXCEPTION 'invalid'; END IF;
  RETURN jsonb_build_object('budget',v_budget,'freeFrom',p->>'freeFrom','freeTo',p->>'freeTo',
    'maxTravelMin',v_travel,'originLat',round(v_lat,2),'originLng',round(v_lng,2));
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid planning preferences.' USING ERRCODE='22023';
END $v2prefs$;

CREATE OR REPLACE FUNCTION public.party_v2_store_preferences(p_member uuid,p jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $v2store$
DECLARE v_p jsonb:=public.party_v2_preferences(p);
BEGIN
  INSERT INTO public.party_preferences(member_id,budget,free_from,free_to,max_travel_min,origin_lat,origin_lng,confirmed)
    VALUES(p_member,(v_p->>'budget')::integer,(v_p->>'freeFrom')::time,(v_p->>'freeTo')::time,
      (v_p->>'maxTravelMin')::integer,(v_p->>'originLat')::numeric,(v_p->>'originLng')::numeric,true)
  ON CONFLICT(member_id) DO UPDATE SET budget=excluded.budget,free_from=excluded.free_from,free_to=excluded.free_to,
    max_travel_min=excluded.max_travel_min,origin_lat=excluded.origin_lat,origin_lng=excluded.origin_lng,confirmed=true,submitted_at=now();
END $v2store$;

CREATE OR REPLACE FUNCTION public.party_v2_dates(p jsonb) RETURNS date[]
LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $v2dates$
DECLARE v_dates date[]:='{}'; v_d date; v_e jsonb; v_today date:=(now() AT TIME ZONE 'America/Montreal')::date;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'array' OR jsonb_array_length(p)>7 THEN RAISE EXCEPTION 'invalid'; END IF;
  FOR v_e IN SELECT value FROM jsonb_array_elements(p) LOOP
    v_d:=public.party_v3_date(v_e);
    IF v_d<v_today OR v_d>v_today+7 OR (cardinality(v_dates)>0 AND v_d<=v_dates[cardinality(v_dates)]) THEN RAISE EXCEPTION 'invalid'; END IF;
    v_dates:=array_append(v_dates,v_d);
  END LOOP;
  RETURN v_dates;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid planning dates.' USING ERRCODE='22023';
END $v2dates$;

CREATE OR REPLACE FUNCTION public.party_v2_windows(p jsonb,p_dates date[],p_duration integer) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $v2windows$
DECLARE v_entry record; v_block jsonb; v_d date; v_start time; v_end time; v_minutes numeric; v_feasible boolean:=false;
BEGIN
  IF cardinality(p_dates)=0 THEN
    IF p IS NULL OR p='{}'::jsonb THEN RETURN '{}'::jsonb; END IF;
    RAISE EXCEPTION 'invalid';
  END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p='{}'::jsonb THEN RAISE EXCEPTION 'invalid'; END IF;
  FOR v_entry IN SELECT key,value FROM jsonb_each(p) LOOP
    v_d:=public.party_v3_date(to_jsonb(v_entry.key));
    IF NOT (v_d=ANY(p_dates)) OR jsonb_typeof(v_entry.value) IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_entry.value) NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'invalid'; END IF;
    FOR v_block IN SELECT value FROM jsonb_array_elements(v_entry.value) LOOP
      IF NOT public.party_v3_keys(v_block,ARRAY['freeFrom','freeTo']) OR NOT (v_block ?& ARRAY['freeFrom','freeTo'])
         OR jsonb_typeof(v_block->'freeFrom') IS DISTINCT FROM 'string' OR jsonb_typeof(v_block->'freeTo') IS DISTINCT FROM 'string'
         OR v_block->>'freeFrom' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         OR v_block->>'freeTo' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'invalid'; END IF;
      v_start:=(v_block->>'freeFrom')::time; v_end:=(v_block->>'freeTo')::time;
      v_minutes:=extract(epoch FROM (v_end-v_start))/60;
      IF v_minutes<=0 THEN v_minutes:=v_minutes+1440; END IF;
      v_feasible:=v_feasible OR v_minutes>=p_duration;
    END LOOP;
  END LOOP;
  IF NOT v_feasible THEN RAISE EXCEPTION 'invalid'; END IF;
  RETURN p; -- Every supplied block and every supplied date are retained, not shortened or substituted.
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid planning windows.' USING ERRCODE='22023';
END $v2windows$;

CREATE OR REPLACE FUNCTION public.party_member_ready(p_member uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $memberready$
DECLARE v_m public.party_members; v_s public.party_planning; v_p public.party_preferences_v3; v_valid jsonb;
BEGIN
  SELECT m.* INTO v_m FROM public.party_members m WHERE m.id=p_member AND NOT m.removed;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT s.* INTO v_s FROM public.party_planning s WHERE s.party_id=v_m.party_id;
  IF v_s.schema_version=3 THEN
    IF v_s.status IN ('locked','final') THEN RETURN p_member=ANY(v_s.participants); END IF;
    IF v_s.status='locking' THEN
      RETURN coalesce(p_member=ANY(v_s.participants) AND v_s.lock_started_at>now()-interval '30 seconds'
        AND public.party_v3_lease_valid(v_s),false);
    END IF;
    IF NOT public.party_v3_anchor_open(v_s.config_v3,now()) THEN RETURN false; END IF;
    SELECT p.* INTO v_p FROM public.party_preferences_v3 p WHERE p.member_id=p_member AND p.party_id=v_m.party_id;
    IF NOT FOUND OR NOT v_p.submitted OR (v_p.precise_expires_at IS NOT NULL AND v_p.precise_expires_at<=now()) THEN RETURN false; END IF;
    v_valid:=public.party_v3_prefs(v_p.preferences,v_s.config_v3,false);
    RETURN coalesce((v_valid->>'submitted')::boolean,false);
  END IF;
  RETURN EXISTS(SELECT 1 FROM public.party_preferences p WHERE p.member_id=p_member AND p.confirmed
    AND (coalesce(cardinality(v_s.candidate_dates),0)=0 OR EXISTS(
      SELECT 1 FROM public.party_preference_days d WHERE d.member_id=p_member AND d.candidate_dates=v_s.candidate_dates
        AND public.party_v2_windows(d.windows,v_s.candidate_dates,v_s.duration_min)=d.windows)));
EXCEPTION WHEN OTHERS THEN RETURN false;
END $memberready$;

CREATE OR REPLACE FUNCTION public.party_host_ready(p_party uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $hostready$
  SELECT coalesce(bool_or(public.party_member_ready(m.id)),false)
    FROM public.party_members m WHERE m.party_id=p_party AND m.is_host AND NOT m.removed
$hostready$;

CREATE OR REPLACE FUNCTION public.party_planning_phase(p_party uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $phase$
DECLARE v_status text;
BEGIN
  SELECT s.status INTO v_status FROM public.party_planning s WHERE s.party_id=p_party;
  IF v_status='final' THEN RETURN 'FINAL'; END IF;
  IF v_status='locked' THEN RETURN 'RESULT'; END IF;
  IF v_status='no_plan' THEN RETURN 'NO_MATCH'; END IF;
  IF v_status='locking' THEN RETURN 'LOCKING'; END IF;
  IF NOT public.party_host_ready(p_party) THEN RETURN 'HOST_SETUP_PENDING'; END IF;
  IF EXISTS(SELECT 1 FROM public.party_members m WHERE m.party_id=p_party AND NOT m.removed AND NOT m.is_host)
    THEN RETURN 'COLLECTING_GUEST_PREFERENCES'; END IF;
  RETURN 'HOST_READY';
END $phase$;

CREATE OR REPLACE FUNCTION public.party_require_host_setup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $jointrigger$
BEGIN
  PERFORM 1 FROM public.parties p WHERE p.id=NEW.party_id FOR UPDATE;
  IF NOT NEW.is_host AND NOT NEW.removed AND NOT public.party_host_ready(NEW.party_id) THEN
    RAISE EXCEPTION 'The host is still setting up this hangout.' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $jointrigger$;
CREATE TRIGGER party_members_require_host_setup BEFORE INSERT ON public.party_members
  FOR EACH ROW EXECUTE FUNCTION public.party_require_host_setup();


-- Complete 0001 party_access definition, with additive readiness projection only.
CREATE OR REPLACE FUNCTION public.party_access(p_action text, p_code text, p_token text, p_name text DEFAULT '', p_member uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_party public.parties; v_self public.party_members; v_hash text; v_code text; v_members jsonb;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid membership credential'; END IF;
 IF p_action NOT IN ('create','join','read','remove') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid party action'; END IF;
 v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
 IF p_action IN ('create','join') AND (p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 30) THEN RAISE EXCEPTION 'Enter a display name (1–30 characters)'; END IF;
 IF p_action = 'create' THEN
  LOOP
   v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
   INSERT INTO public.parties(code) VALUES(v_code) ON CONFLICT(code) DO NOTHING RETURNING * INTO v_party;
   EXIT WHEN v_party.id IS NOT NULL;
  END LOOP;
  INSERT INTO public.party_members(party_id,display_name,token_hash,is_host) VALUES(v_party.id,trim(p_name),v_hash,true);
 ELSE
  SELECT * INTO v_party FROM public.parties WHERE code = upper(p_code) FOR UPDATE;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'Party not found. Check the code and try again.'; END IF;
 END IF;
 SELECT * INTO v_self FROM public.party_members WHERE party_id = v_party.id AND token_hash = v_hash;
 IF v_self.removed THEN RAISE EXCEPTION 'You have been removed from this party.'; END IF;
 IF p_action = 'join' AND v_self.id IS NULL THEN
  IF (SELECT count(*) FROM public.party_members WHERE party_id = v_party.id AND NOT removed) >= 10 THEN RAISE EXCEPTION 'This party is full (10 people maximum).'; END IF;
  INSERT INTO public.party_members(party_id,display_name,token_hash) VALUES(v_party.id,trim(p_name),v_hash) RETURNING * INTO v_self;
 END IF;
 IF v_self.id IS NULL THEN RAISE EXCEPTION 'Join this party to see its members.'; END IF;
 IF p_action = 'remove' THEN
  IF NOT v_self.is_host THEN RAISE EXCEPTION 'Only the host can remove members.'; END IF;
  IF p_member IS NULL OR p_member = v_self.id THEN RAISE EXCEPTION 'The host cannot be removed.'; END IF;
  UPDATE public.party_members SET removed = true WHERE id = p_member AND party_id = v_party.id AND NOT is_host AND NOT removed;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.'; END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name,'host',is_host) ORDER BY joined_at,id),'[]'::jsonb) INTO v_members FROM public.party_members WHERE party_id = v_party.id AND NOT removed;
 RETURN jsonb_build_object('code',v_party.code,'selfId',v_self.id,'isHost',v_self.is_host,'members',v_members,'hostReady',public.party_host_ready(v_party.id),'phase',public.party_planning_phase(v_party.id));
END;
$$;

-- Complete 0028 party_plan definition, with guarded offline edits; 0029 preferences validator remains installed.
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
  IF NOT v_self.is_host AND NOT public.party_host_ready(v_party) THEN RAISE EXCEPTION 'The host is still setting up this hangout.' USING ERRCODE='55000'; END IF;
  v_res := public.party_v3_prefs(p_payload->'preferences', v_state.config_v3, true);
  SELECT * INTO v_old FROM public.party_preferences_v3 WHERE member_id=v_self.id;
  IF v_old.member_id IS NULL OR v_old.preferences IS DISTINCT FROM v_res->'doc' OR v_old.submitted IS DISTINCT FROM (v_res->>'submitted')::boolean OR (v_old.precise_expires_at IS NULL) <> (v_res->>'preciseExpiresAt' IS NULL) THEN
   INSERT INTO public.party_preferences_v3(member_id,party_id,preferences,submitted,precise_expires_at,updated_at)
   VALUES(v_self.id,v_party,v_res->'doc',(v_res->>'submitted')::boolean,(v_res->>'preciseExpiresAt')::timestamptz,now())
   ON CONFLICT(member_id) DO UPDATE SET preferences=excluded.preferences,submitted=excluded.submitted,precise_expires_at=excluded.precise_expires_at,updated_at=excluded.updated_at;
  END IF;
 ELSIF p_action='begin_lock' AND v_v3 THEN
  IF v_state.status='collecting' OR (v_state.status='locking' AND v_state.lock_started_at < now()-interval '30 seconds') THEN
   IF v_state.status='locking' THEN
    UPDATE public.party_planning SET status='collecting',lock_id=NULL,lock_snapshot=NULL,participants='{}' WHERE party_id=v_party;
   END IF;
   IF NOT public.party_v3_anchor_open(v_state.config_v3, now()) THEN RAISE EXCEPTION 'Choose new dates before locking.'; END IF;
   IF NOT public.party_host_ready(v_party) THEN RAISE EXCEPTION 'Submit your own preferences before locking.' USING ERRCODE='55000'; END IF;
   IF NOT public.party_member_ready(v_self.id) THEN RAISE EXCEPTION 'Submit your own preferences before locking.' USING ERRCODE='55000'; END IF;
   SELECT count(*) INTO v_count FROM public.party_preferences_v3 p JOIN public.party_members m ON m.id=p.member_id WHERE m.party_id=v_party AND NOT m.removed AND public.party_member_ready(m.id);
   IF v_count < 2 THEN RAISE EXCEPTION 'At least 2 members must submit before locking.'; END IF;
   v_lease := gen_random_uuid(); v_acquired := true;
   UPDATE public.party_planning SET status='locking',lock_id=v_lease,lock_started_at=now(),revision=revision+1,
     lock_snapshot=jsonb_build_object('schemaVersion',3,'revision',v_state.revision+1,'config',config_v3,
       'members',(SELECT jsonb_agg(jsonb_build_object('id',m.id,'preferences',p.preferences) ORDER BY m.id) FROM public.party_preferences_v3 p JOIN public.party_members m ON m.id=p.member_id WHERE m.party_id=v_party AND NOT m.removed AND public.party_member_ready(m.id))),
     participants=ARRAY(SELECT m.id FROM public.party_members m JOIN public.party_preferences_v3 p ON p.member_id=m.id WHERE m.party_id=v_party AND NOT m.removed AND public.party_member_ready(m.id) ORDER BY m.id),
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
  IF cardinality(v_state.candidate_dates)>0 THEN RAISE EXCEPTION 'Use the atomic calendar preference request.' USING ERRCODE='22023'; END IF;
  IF NOT v_self.is_host AND NOT public.party_host_ready(v_party) THEN RAISE EXCEPTION 'The host is still setting up this hangout.' USING ERRCODE='55000'; END IF;
  PERFORM public.party_v2_store_preferences(v_self.id,p_payload);
 ELSIF p_action='configure' THEN
  IF v_state.status <> 'collecting' THEN RAISE EXCEPTION 'Planning configuration is frozen.'; END IF;
  IF p_payload IS NULL OR NOT (p_payload ?& ARRAY['date','durationMin','areaLabel','areaLat','areaLng','category']) OR length(trim(coalesce(p_payload->>'areaLabel',''))) NOT BETWEEN 1 AND 80 OR p_payload->>'category' NOT IN ('park','cafe','museum','restaurant','activity') OR (p_payload->>'category') IS NULL THEN RAISE EXCEPTION 'Invalid planning configuration.'; END IF;
  IF (p_payload->>'date') IS NULL OR (p_payload->>'date')::date NOT BETWEEN (now() AT TIME ZONE 'America/Montreal')::date AND (now() AT TIME ZONE 'America/Montreal')::date + 14 THEN RAISE EXCEPTION 'Choose a date in the next 14 days.'; END IF;
  IF cardinality(v_state.candidate_dates)>0 AND (p_payload->>'date')::date IS DISTINCT FROM v_state.candidate_dates[1] THEN
   RAISE EXCEPTION 'Use the atomic calendar configuration.' USING ERRCODE='22023';
  END IF;
  IF (p_payload->>'date')::date IS DISTINCT FROM v_state.event_date THEN
   UPDATE public.party_preferences p SET confirmed=false WHERE p.member_id IN(SELECT m.id FROM public.party_members m WHERE m.party_id=v_party AND NOT m.is_host);
   DELETE FROM public.party_preference_days d WHERE d.member_id IN(SELECT m.id FROM public.party_members m WHERE m.party_id=v_party);
   UPDATE public.party_planning SET revision=revision+1 WHERE party_id=v_party;
  END IF;
  UPDATE public.party_planning SET event_date=(p_payload->>'date')::date,duration_min=(p_payload->>'durationMin')::integer,area_label=trim(p_payload->>'areaLabel'),area_lat=(p_payload->>'areaLat')::double precision,area_lng=(p_payload->>'areaLng')::double precision,category=p_payload->>'category' WHERE party_id=v_party;
 ELSIF p_action='begin_lock' THEN
  IF v_state.status='collecting' OR (v_state.status='locking' AND v_state.lock_started_at < now()-interval '30 seconds') THEN
   IF v_state.status='locking' THEN
    UPDATE public.party_planning SET status='collecting',lock_id=NULL,lock_snapshot=NULL,participants='{}' WHERE party_id=v_party;
   END IF;
   IF NOT public.party_host_ready(v_party) THEN RAISE EXCEPTION 'Submit your own preferences before locking.' USING ERRCODE='55000'; END IF;
   SELECT count(*) INTO v_count FROM public.party_members m WHERE m.party_id=v_party AND NOT m.removed AND public.party_member_ready(m.id);
   IF v_count < 2 THEN RAISE EXCEPTION 'At least 2 members must submit before locking.' USING ERRCODE='55000'; END IF;
   v_lease := gen_random_uuid(); v_acquired := true;
   UPDATE public.party_planning SET status='locking',lock_id=v_lease,lock_started_at=now(),revision=revision+1,
     lock_snapshot=jsonb_build_object(
       'config',jsonb_build_object('date',event_date,'durationMin',duration_min,'areaLabel',area_label,
         'area',jsonb_build_object('lat',area_lat,'lng',area_lng),'category',category)
         || CASE WHEN cardinality(candidate_dates)>0 THEN jsonb_build_object('dates',to_jsonb(candidate_dates)) ELSE '{}'::jsonb END,
       'members',(SELECT jsonb_agg(
         jsonb_build_object('id',m.id,'budget',p.budget,'freeFrom',to_char(p.free_from,'HH24:MI'),
           'freeTo',to_char(p.free_to,'HH24:MI'),'maxTravelMin',p.max_travel_min,
           'origin',CASE WHEN p.origin_lat IS NOT NULL THEN jsonb_build_object('lat',p.origin_lat,'lng',p.origin_lng) ELSE NULL END)
         || CASE WHEN cardinality(v_state.candidate_dates)>0 THEN jsonb_build_object('dayWindows',d.windows) ELSE '{}'::jsonb END
         ORDER BY m.id)
         FROM public.party_members m JOIN public.party_preferences p ON p.member_id=m.id
         LEFT JOIN public.party_preference_days d ON d.member_id=m.id AND d.candidate_dates=v_state.candidate_dates
         WHERE m.party_id=v_party AND NOT m.removed AND public.party_member_ready(m.id))),
     participants=ARRAY(SELECT m.id FROM public.party_members m WHERE m.party_id=v_party AND NOT m.removed AND public.party_member_ready(m.id) ORDER BY m.id),
     outliers='{}',options='[]',plan_index=0,group_rerolls_used=0 WHERE party_id=v_party;
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
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'submitted',public.party_member_ready(m.id)) ORDER BY m.joined_at,m.id),'[]')
    INTO v_ready FROM public.party_members m WHERE m.party_id=v_party AND NOT m.removed;
  v_plan := NULL;
  IF v_state.status IN ('locked','final') THEN
   BEGIN v_plan := public.party_plan_public_option_v3(v_state.options->v_state.plan_index, v_state.config_v3); EXCEPTION WHEN OTHERS THEN v_plan := NULL; END;
  END IF;
  RETURN jsonb_build_object('schemaVersion',3,'status',v_state.status,'revision',v_state.revision,'config',v_state.config_v3,'plan',v_plan,'selfPreferences',v_pref,'members',v_ready,'planIndex',v_state.plan_index,'optionCount',jsonb_array_length(v_state.options),'groupRerollsUsed',v_state.group_rerolls_used,'votes',v_votes,'voteThreshold',ceil(v_count/2.0),'selfVoted',EXISTS(SELECT 1 FROM public.party_reroll_votes WHERE party_id=v_party AND member_id=v_self.id AND revision=v_state.revision),'noPlanReason',CASE WHEN v_state.status='no_plan' THEN 'no_match' ELSE NULL END,'venueSource',CASE WHEN v_state.status IN ('locked','final') AND v_state.venue_source='curated' THEN 'curated' ELSE NULL END)
   || jsonb_build_object('hostReady',public.party_host_ready(v_party),'phase',public.party_planning_phase(v_party),'selfConfirmed',public.party_member_ready(v_self.id))
 || CASE WHEN p_action='begin_lock' THEN jsonb_build_object('acquired',v_acquired,'lease',v_lease) ELSE '{}'::jsonb END;
 END IF;
 SELECT jsonb_build_object('budget',budget,'freeFrom',to_char(free_from,'HH24:MI'),'freeTo',to_char(free_to,'HH24:MI'),'maxTravelMin',max_travel_min,'originLat',origin_lat,'originLng',origin_lng) INTO v_pref FROM public.party_preferences WHERE member_id=v_self.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'submitted',public.party_member_ready(m.id)) ORDER BY m.joined_at,m.id),'[]') INTO v_ready FROM public.party_members m WHERE m.party_id=v_party AND NOT m.removed;
 RETURN jsonb_build_object('schemaVersion',2,'status',v_state.status,'revision',v_state.revision,'selfPreferences',v_pref,'members',v_ready,'config',jsonb_build_object('date',v_state.event_date,'durationMin',v_state.duration_min,'areaLabel',v_state.area_label,'area',jsonb_build_object('lat',v_state.area_lat,'lng',v_state.area_lng),'category',v_state.category),'plan',public.party_plan_public_option(v_state.options->v_state.plan_index),'planIndex',v_state.plan_index,'optionCount',jsonb_array_length(v_state.options),'groupRerollsUsed',v_state.group_rerolls_used,'votes',v_votes,'voteThreshold',ceil(v_count/2.0),'selfVoted',EXISTS(SELECT 1 FROM public.party_reroll_votes WHERE party_id=v_party AND member_id=v_self.id AND revision=v_state.revision),'noPlanReason',CASE WHEN v_state.status='no_plan' THEN 'no_match' ELSE NULL END,'venueSource',v_state.venue_source)
 || jsonb_build_object('hostReady',public.party_host_ready(v_party),'phase',public.party_planning_phase(v_party),'selfConfirmed',public.party_member_ready(v_self.id))
 || CASE WHEN p_action='begin_lock' THEN jsonb_build_object('acquired',v_acquired,'lease',v_lease) ELSE '{}'::jsonb END;
END; $function$;

CREATE OR REPLACE FUNCTION public.party_plan_days(p_action text,p_code text,p_token text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $days$
DECLARE v_access jsonb; v_party uuid; v_self public.party_members; v_s public.party_planning;
  v_dates date[]; v_windows jsonb; v_preferences jsonb; v_date date; v_category text; v_changed boolean; v_self_windows jsonb;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('read','configure','save') OR p_payload IS NULL
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR pg_column_size(p_payload)>32768 THEN
    RAISE EXCEPTION 'Invalid planning request.' USING ERRCODE='22023';
  END IF;
  v_access:=public.party_access('read',p_code,p_token);
  SELECT p.id INTO v_party FROM public.parties p WHERE p.code=v_access->>'code' FOR UPDATE;
  SELECT m.* INTO v_self FROM public.party_members m WHERE m.id=(v_access->>'selfId')::uuid;
  INSERT INTO public.party_planning(party_id) VALUES(v_party) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.party_planning s WHERE s.party_id=v_party FOR UPDATE;
  PERFORM public.party_v3_expire(v_party);
  SELECT s.* INTO v_s FROM public.party_planning s WHERE s.party_id=v_party FOR UPDATE;
  IF p_action='read' THEN
    IF p_payload<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid planning request.' USING ERRCODE='22023'; END IF;
  ELSE
    IF v_s.schema_version<>2 THEN RAISE EXCEPTION 'Use the versioned planning request.' USING ERRCODE='22023'; END IF;
    IF p_action='configure' AND NOT v_self.is_host THEN RAISE EXCEPTION 'Only the host can manage planning.' USING ERRCODE='42501'; END IF;
    IF p_action='save' AND v_self.is_host THEN RAISE EXCEPTION 'Use the atomic host configuration.' USING ERRCODE='22023'; END IF;
    IF v_s.status<>'collecting' THEN RAISE EXCEPTION 'Preferences are frozen until the host reopens planning.' USING ERRCODE='55000'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) AS keys(key)
               WHERE key <> ALL(CASE WHEN p_action='configure' THEN ARRAY['dates','windows','preferences','expectedRevision','category'] ELSE ARRAY['windows','preferences','expectedRevision'] END))
      OR NOT (p_payload ?& ARRAY['preferences','expectedRevision'])
      OR (p_action='configure' AND NOT (p_payload ? 'dates'))
      OR jsonb_typeof(p_payload->'expectedRevision') IS DISTINCT FROM 'number'
      OR (p_payload->>'expectedRevision') !~ '^[0-9]{1,10}$' OR (p_payload->>'expectedRevision')::numeric>2147483647 THEN
      RAISE EXCEPTION 'Invalid planning request.' USING ERRCODE='22023';
    END IF;
    IF (p_payload->>'expectedRevision')::integer<>v_s.revision THEN
      RAISE EXCEPTION 'This plan changed. Refresh and try again.' USING ERRCODE='40001';
    END IF;
    v_preferences:=public.party_v2_preferences(p_payload->'preferences');
    IF p_action='configure' THEN
      IF NOT (p_payload ? 'dates') THEN RAISE EXCEPTION 'Invalid planning dates.' USING ERRCODE='22023'; END IF;
      v_dates:=public.party_v2_dates(p_payload->'dates');
      v_date:=CASE WHEN cardinality(v_dates)=0 THEN (now() AT TIME ZONE 'America/Montreal')::date ELSE v_dates[1] END;
      v_category:=v_s.category;
      IF p_payload ? 'category' THEN
        IF jsonb_typeof(p_payload->'category') IS DISTINCT FROM 'string' OR p_payload->>'category' NOT IN ('park','cafe','museum','restaurant','activity') THEN
          RAISE EXCEPTION 'Invalid planning configuration.' USING ERRCODE='22023';
        END IF;
        v_category:=p_payload->>'category';
      END IF;
    ELSE
      IF NOT public.party_host_ready(v_party) THEN
        RAISE EXCEPTION 'The host is still setting up this hangout.' USING ERRCODE='55000';
      END IF;
      v_dates:=v_s.candidate_dates; v_date:=v_s.event_date; v_category:=v_s.category;
    END IF;
    v_windows:=public.party_v2_windows(p_payload->'windows',v_dates,v_s.duration_min);
    v_changed:=p_action='configure' AND (v_s.candidate_dates IS DISTINCT FROM v_dates OR v_s.event_date IS DISTINCT FROM v_date OR v_s.category IS DISTINCT FROM v_category);
    IF v_changed THEN
      UPDATE public.party_preferences p SET confirmed=false WHERE p.member_id IN(SELECT m.id FROM public.party_members m WHERE m.party_id=v_party);
      DELETE FROM public.party_preference_days d WHERE d.member_id IN(SELECT m.id FROM public.party_members m WHERE m.party_id=v_party);
      DELETE FROM public.party_reroll_votes r WHERE r.party_id=v_party;
    END IF;
    IF p_action='configure' THEN
      UPDATE public.party_planning s SET candidate_dates=v_dates,event_date=v_date,category=v_category,
        revision=s.revision+CASE WHEN v_changed THEN 1 ELSE 0 END WHERE s.party_id=v_party;
    END IF;
    PERFORM public.party_v2_store_preferences(v_self.id,v_preferences);
    IF cardinality(v_dates)>0 THEN
      INSERT INTO public.party_preference_days(member_id,candidate_dates,windows) VALUES(v_self.id,v_dates,v_windows)
       ON CONFLICT(member_id) DO UPDATE SET candidate_dates=excluded.candidate_dates,windows=excluded.windows,updated_at=now();
    ELSE
      DELETE FROM public.party_preference_days d WHERE d.member_id=v_self.id;
    END IF;
  END IF;
  SELECT s.* INTO v_s FROM public.party_planning s WHERE s.party_id=v_party;
  v_self_windows:=NULL;
  IF v_s.schema_version=2 AND cardinality(v_s.candidate_dates)>0 THEN
    SELECT d.windows INTO v_self_windows FROM public.party_preference_days d WHERE d.member_id=v_self.id AND d.candidate_dates=v_s.candidate_dates;
  END IF;
  RETURN jsonb_build_object('dates',CASE WHEN v_s.schema_version=3 THEN v_s.config_v3#>'{dateSelection,candidateDates}' ELSE to_jsonb(v_s.candidate_dates) END,
    'selfWindows',v_self_windows,'hostReady',public.party_host_ready(v_party),'phase',public.party_planning_phase(v_party),
    'schemaVersion',v_s.schema_version,'revision',v_s.revision);
END $days$;

CREATE OR REPLACE FUNCTION public.invite_group_to_journey(p_group uuid,p_code text,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $invite$
DECLARE me uuid:=auth.uid(); my_name text; n integer; v_access jsonb; v_party uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_signed_in' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.friend_group_members m WHERE m.group_id=p_group AND m.user_id=me AND m.status='member') THEN
    RETURN jsonb_build_object('ok',false,'error','not_allowed');
  END IF;
  SELECT p.id INTO v_party FROM public.parties p WHERE p.code=upper(p_code) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','no_journey'); END IF;
  BEGIN v_access:=public.party_access('read',p_code,p_token);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error','not_allowed'); END;
  IF (v_access->>'isHost')::boolean IS DISTINCT FROM true THEN RETURN jsonb_build_object('ok',false,'error','not_allowed'); END IF;
  IF NOT public.party_host_ready(v_party) THEN RETURN jsonb_build_object('ok',false,'error','host_not_ready'); END IF;
  -- Recheck group membership after waiting on the party lock.
  IF NOT EXISTS(SELECT 1 FROM public.friend_group_members m WHERE m.group_id=p_group AND m.user_id=me AND m.status='member') THEN
    RETURN jsonb_build_object('ok',false,'error','not_allowed');
  END IF;
  SELECT username INTO my_name FROM public.account_preferences WHERE user_id=me;
  INSERT INTO public.notifications(user_id,kind,actor_username,detail)
    SELECT m.user_id,'journey_invite',my_name,upper(p_code) FROM public.friend_group_members m WHERE m.group_id=p_group AND m.status='member' AND m.user_id<>me;
  GET DIAGNOSTICS n=ROW_COUNT;
  UPDATE public.friend_groups SET updated_at=now() WHERE id=p_group;
  RETURN jsonb_build_object('ok',true,'invited',n);
END $invite$;

-- Disable the old unauthenticated-by-capability entry point without dropping its historical definition.
REVOKE ALL ON FUNCTION public.invite_group_to_journey(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.invite_group_to_journey(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.invite_group_to_journey(uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.party_member_ready(uuid),public.party_host_ready(uuid),public.party_planning_phase(uuid),
  public.party_require_host_setup(),public.party_v2_preferences(jsonb),public.party_v2_store_preferences(uuid,jsonb),
  public.party_v2_dates(jsonb),public.party_v2_windows(jsonb,date[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.party_member_ready(uuid),public.party_host_ready(uuid),public.party_planning_phase(uuid),
  public.party_require_host_setup(),public.party_v2_preferences(jsonb),public.party_v2_store_preferences(uuid,jsonb),
  public.party_v2_dates(jsonb),public.party_v2_windows(jsonb,date[],integer) TO service_role;
REVOKE ALL ON FUNCTION public.party_access(text,text,text,text,uuid),public.party_plan(text,text,text,jsonb),public.party_plan_days(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.party_access(text,text,text,text,uuid),public.party_plan(text,text,text,jsonb),public.party_plan_days(text,text,text,jsonb) TO anon,authenticated,service_role;
REVOKE ALL ON TABLE public.party_preferences,public.party_planning,public.party_preferences_v3,public.party_preference_days FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.party_preferences,public.party_planning,public.party_preferences_v3,public.party_preference_days TO service_role;
-- Installed 0026 bodies are deliberately not replaced: frozen V3 lease/snapshot/complete validation stays byte-exact.
REVOKE ALL ON FUNCTION public.party_plan_snapshot(text,uuid),public.party_plan_complete(text,uuid,jsonb,uuid[],text,boolean),public.party_v3_lease_valid(public.party_planning) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.party_plan_snapshot(text,uuid),public.party_plan_complete(text,uuid,jsonb,uuid[],text,boolean),public.party_v3_lease_valid(public.party_planning) TO service_role;
