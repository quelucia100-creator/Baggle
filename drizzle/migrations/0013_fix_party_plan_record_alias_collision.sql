DO $repair$
DECLARE
  current_definition text;
  repaired_definition text;
  existing_acl aclitem[];
BEGIN
  SELECT pg_get_functiondef(oid), proacl INTO current_definition, existing_acl
  FROM pg_proc WHERE oid = 'public.party_plan(text,text,text,jsonb)'::regprocedure;
  IF position('r record;' IN current_definition) = 0
     OR position('FOR r IN SELECT member_id, preferences' IN current_definition) = 0
     OR position('party_v3_prefs(r.preferences, v_cfg, false)' IN current_definition) = 0
     OR position('WHERE member_id=r.member_id;' IN current_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected party_plan definition; repair not applied.';
  END IF;
  repaired_definition := replace(current_definition, 'r record;', 'v_preference_row record;');
  repaired_definition := replace(repaired_definition, 'FOR r IN SELECT member_id, preferences', 'FOR v_preference_row IN SELECT member_id, preferences');
  repaired_definition := replace(repaired_definition, 'party_v3_prefs(r.preferences, v_cfg, false)', 'party_v3_prefs(v_preference_row.preferences, v_cfg, false)');
  repaired_definition := replace(repaired_definition, 'WHERE member_id=r.member_id;', 'WHERE member_id=v_preference_row.member_id;');
  EXECUTE repaired_definition;
  IF (SELECT proacl FROM pg_proc WHERE oid = 'public.party_plan(text,text,text,jsonb)'::regprocedure) IS DISTINCT FROM existing_acl THEN
    RAISE EXCEPTION 'party_plan permissions changed unexpectedly.';
  END IF;
END;
$repair$;