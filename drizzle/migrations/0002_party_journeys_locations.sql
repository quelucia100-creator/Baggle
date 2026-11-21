ALTER TABLE public.parties ADD COLUMN journey_started boolean NOT NULL DEFAULT false, ADD COLUMN hangout jsonb, ADD COLUMN weather_cache jsonb, ADD COLUMN weather_cached_at timestamptz, ADD COLUMN weather_key text;
ALTER TABLE public.party_members ADD COLUMN latitude double precision, ADD COLUMN longitude double precision, ADD COLUMN location_updated_at timestamptz;
CREATE FUNCTION public.party_journey(p_action text, p_code text, p_token text, p_name text DEFAULT '', p_member uuid DEFAULT NULL, p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb; v_party public.parties; v_self public.party_members; v_members jsonb;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('create','join','read','remove','start','team','location','clear_location','hangout','clear_hangout') THEN RAISE EXCEPTION 'Invalid party action'; END IF;
 v_result := public.party_access(CASE WHEN p_action IN ('create','join','remove') THEN p_action ELSE 'read' END,p_code,p_token,CASE WHEN p_action IN ('create','join') THEN p_name ELSE '' END,p_member);
 SELECT * INTO v_party FROM public.parties WHERE code=v_result->>'code' FOR UPDATE;
 SELECT * INTO v_self FROM public.party_members WHERE id=(v_result->>'selfId')::uuid;
 IF p_action IN ('start','team','hangout','clear_hangout') AND NOT v_self.is_host THEN RAISE EXCEPTION 'Only the host can manage the journey.'; END IF;
 IF p_action IN ('location','hangout') AND (p_lat IS NULL OR p_lng IS NULL OR NOT(p_lat BETWEEN -90 AND 90) OR NOT(p_lng BETWEEN -180 AND 180)) THEN RAISE EXCEPTION 'Invalid location coordinates'; END IF;
 IF p_action='start' THEN UPDATE public.parties SET journey_started=true WHERE id=v_party.id;
 ELSIF p_action='team' THEN UPDATE public.parties SET journey_started=false WHERE id=v_party.id;
 ELSIF p_action='location' THEN UPDATE public.party_members SET latitude=p_lat,longitude=p_lng,location_updated_at=now() WHERE id=v_self.id;
 ELSIF p_action='clear_location' THEN UPDATE public.party_members SET latitude=NULL,longitude=NULL,location_updated_at=NULL WHERE id=v_self.id;
 ELSIF p_action='hangout' THEN
  IF length(trim(p_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Enter a hangout name (1–80 characters)'; END IF;
  UPDATE public.parties SET hangout=jsonb_build_object('name',trim(p_name),'lat',p_lat,'lng',p_lng) WHERE id=v_party.id;
 ELSIF p_action='clear_hangout' THEN UPDATE public.parties SET hangout=NULL WHERE id=v_party.id;
 END IF;
 SELECT * INTO v_party FROM public.parties WHERE id=v_party.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name,'host',is_host,'location',CASE WHEN location_updated_at>now()-interval '30 minutes' AND latitude IS NOT NULL THEN jsonb_build_object('lat',latitude,'lng',longitude,'updatedAt',location_updated_at) ELSE NULL END) ORDER BY joined_at,id),'[]'::jsonb) INTO v_members FROM public.party_members WHERE party_id=v_party.id AND NOT removed;
 RETURN v_result || jsonb_build_object('started',v_party.journey_started,'hangout',v_party.hangout,'members',v_members);
END;
$$;
REVOKE ALL ON FUNCTION public.party_journey(text,text,text,text,uuid,double precision,double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.party_journey(text,text,text,text,uuid,double precision,double precision) TO anon,authenticated,service_role;