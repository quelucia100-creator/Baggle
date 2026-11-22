ALTER TABLE public.party_members ADD COLUMN status_view boolean NOT NULL DEFAULT false, ADD COLUMN event_vote text, ADD COLUMN event_round uuid;
ALTER TABLE public.parties ADD COLUMN event_state jsonb;
CREATE OR REPLACE FUNCTION public.party_journey(p_action text, p_code text, p_token text, p_name text DEFAULT '', p_member uuid DEFAULT NULL, p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb; v_party public.parties; v_self public.party_members; v_members jsonb;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('create','join','read','remove','start','team','map','location','clear_location','hangout','clear_hangout') THEN RAISE EXCEPTION 'Invalid party action'; END IF;
 v_result := public.party_access(CASE WHEN p_action IN ('create','join','remove') THEN p_action ELSE 'read' END,p_code,p_token,CASE WHEN p_action IN ('create','join') THEN p_name ELSE '' END,p_member);
 SELECT * INTO v_party FROM public.parties WHERE code=v_result->>'code' FOR UPDATE;
 SELECT * INTO v_self FROM public.party_members WHERE id=(v_result->>'selfId')::uuid;
 IF p_action IN ('start','hangout','clear_hangout') AND NOT v_self.is_host THEN RAISE EXCEPTION 'Only the host can manage the journey.'; END IF;
 IF p_action IN ('location','hangout') AND (p_lat IS NULL OR p_lng IS NULL OR NOT(p_lat BETWEEN -90 AND 90) OR NOT(p_lng BETWEEN -180 AND 180)) THEN RAISE EXCEPTION 'Invalid location coordinates'; END IF;
 IF p_action='start' THEN
  IF NOT v_party.journey_started THEN UPDATE public.party_members SET status_view=false WHERE party_id=v_party.id; END IF;
  UPDATE public.parties SET journey_started=true WHERE id=v_party.id;
 ELSIF p_action='team' THEN UPDATE public.party_members SET status_view=true WHERE id=v_self.id;
 ELSIF p_action='map' THEN
  IF NOT v_party.journey_started THEN RAISE EXCEPTION 'The host has not started the journey.'; END IF;
  UPDATE public.party_members SET status_view=false WHERE id=v_self.id;
 ELSIF p_action='location' THEN UPDATE public.party_members SET latitude=p_lat,longitude=p_lng,location_updated_at=now() WHERE id=v_self.id;
 ELSIF p_action='clear_location' THEN UPDATE public.party_members SET latitude=NULL,longitude=NULL,location_updated_at=NULL WHERE id=v_self.id;
 ELSIF p_action='hangout' THEN
  IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Enter a hangout name (1–80 characters)'; END IF;
  UPDATE public.parties SET hangout=jsonb_build_object('name',trim(p_name),'lat',p_lat,'lng',p_lng) WHERE id=v_party.id;
 ELSIF p_action='clear_hangout' THEN UPDATE public.parties SET hangout=NULL WHERE id=v_party.id;
 END IF;
 SELECT * INTO v_party FROM public.parties WHERE id=v_party.id;
 SELECT * INTO v_self FROM public.party_members WHERE id=v_self.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name,'host',is_host,'location',CASE WHEN location_updated_at>now()-interval '30 minutes' AND latitude IS NOT NULL THEN jsonb_build_object('lat',latitude,'lng',longitude,'updatedAt',location_updated_at) ELSE NULL END) ORDER BY joined_at,id),'[]'::jsonb) INTO v_members FROM public.party_members WHERE party_id=v_party.id AND NOT removed;
 RETURN v_result || jsonb_build_object('started',v_party.journey_started,'view',CASE WHEN v_party.journey_started AND NOT v_self.status_view THEN 'map' ELSE 'team' END,'hangout',v_party.hangout,'members',v_members);
END;
$$;
CREATE FUNCTION public.party_event(p_action text, p_code text, p_token text, p_name text DEFAULT '', p_member uuid DEFAULT NULL, p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL, p_round uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb; v_party public.parties; v_self public.party_members; v_options jsonb; v_candidate text; v_round uuid; v_yes int; v_no int; v_vote text;
BEGIN
 v_result:=public.party_journey(CASE WHEN p_action IN ('prompt_vote','reroll','vote_yes','vote_no','confirm_event') THEN 'read' ELSE p_action END,p_code,p_token,p_name,p_member,p_lat,p_lng);
 SELECT * INTO v_party FROM public.parties WHERE code=v_result->>'code' FOR UPDATE;
 SELECT * INTO v_self FROM public.party_members WHERE id=(v_result->>'selfId')::uuid;
 IF p_action IN ('prompt_vote','reroll','confirm_event') AND NOT v_self.is_host THEN RAISE EXCEPTION 'Only the host can manage event voting.'; END IF;
 IF p_action='prompt_vote' THEN
  v_options:=p_name::jsonb;
  IF jsonb_typeof(v_options) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Add at least two event choices.'; END IF;
  IF jsonb_array_length(v_options) NOT BETWEEN 2 AND 20 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_options) e WHERE jsonb_typeof(e) IS DISTINCT FROM 'string' OR length(trim(e#>>'{}')) NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'Add 2–20 event choices, each 1–80 characters.'; END IF;
  SELECT jsonb_agg(name ORDER BY name) INTO v_options FROM (SELECT DISTINCT trim(value) name FROM jsonb_array_elements_text(v_options)) s;
  IF jsonb_array_length(v_options)<2 THEN RAISE EXCEPTION 'Add at least two different event choices.'; END IF;
  SELECT value INTO v_candidate FROM jsonb_array_elements_text(v_options) ORDER BY random() LIMIT 1;
  UPDATE public.parties SET event_state=jsonb_build_object('options',v_options,'candidate',v_candidate,'round',gen_random_uuid(),'open',true,'chosen',NULL) WHERE id=v_party.id;
 ELSIF p_action IN ('reroll','vote_yes','vote_no','confirm_event') THEN
  IF v_party.event_state IS NULL OR p_round IS DISTINCT FROM (v_party.event_state->>'round')::uuid THEN RAISE EXCEPTION 'This suggestion changed. Refresh and try again.'; END IF;
  IF NOT (v_party.event_state->>'open')::boolean THEN RAISE EXCEPTION 'This vote is closed.'; END IF;
  IF p_action='reroll' THEN
   SELECT value INTO v_candidate FROM jsonb_array_elements_text(v_party.event_state->'options') WHERE value<>v_party.event_state->>'candidate' ORDER BY random() LIMIT 1;
   UPDATE public.parties SET event_state=event_state || jsonb_build_object('candidate',v_candidate,'round',gen_random_uuid(),'chosen',NULL) WHERE id=v_party.id;
  ELSIF p_action='confirm_event' THEN UPDATE public.parties SET event_state=event_state || jsonb_build_object('open',false,'chosen',event_state->>'candidate') WHERE id=v_party.id;
  ELSE UPDATE public.party_members SET event_vote=CASE WHEN p_action='vote_yes' THEN 'yes' ELSE 'no' END,event_round=p_round WHERE id=v_self.id;
  END IF;
 END IF;
 SELECT * INTO v_party FROM public.parties WHERE id=v_party.id;
 IF v_party.event_state IS NOT NULL THEN
  v_round:=(v_party.event_state->>'round')::uuid;
  SELECT count(*) FILTER(WHERE event_vote='yes'),count(*) FILTER(WHERE event_vote='no') INTO v_yes,v_no FROM public.party_members WHERE party_id=v_party.id AND NOT removed AND event_round=v_round;
  SELECT event_vote INTO v_vote FROM public.party_members WHERE id=v_self.id AND event_round=v_round;
  RETURN v_result || jsonb_build_object('event',v_party.event_state || jsonb_build_object('yes',v_yes,'no',v_no,'selfVote',v_vote));
 END IF;
 RETURN v_result || jsonb_build_object('event',NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.party_event(text,text,text,text,uuid,double precision,double precision,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.party_event(text,text,text,text,uuid,double precision,double precision,uuid) TO anon,authenticated,service_role;