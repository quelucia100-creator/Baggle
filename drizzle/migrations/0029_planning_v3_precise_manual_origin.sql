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
      IF v_src NOT IN ('current_location','manual') THEN RAISE EXCEPTION 'invalid'; END IF;
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

REVOKE ALL ON FUNCTION public.party_v3_prefs(jsonb,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.party_v3_prefs(jsonb,jsonb,boolean) TO service_role;