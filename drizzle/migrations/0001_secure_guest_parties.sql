CREATE TABLE public.parties (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL CHECK (code ~ '^[A-Z0-9]{6}$'), created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.parties TO service_role;
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.party_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE, display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 30), token_hash text NOT NULL, is_host boolean NOT NULL DEFAULT false, removed boolean NOT NULL DEFAULT false, joined_at timestamptz NOT NULL DEFAULT now(), UNIQUE(party_id, token_hash));
GRANT ALL ON public.party_members TO service_role;
ALTER TABLE public.party_members ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX party_one_host ON public.party_members(party_id) WHERE is_host;
CREATE FUNCTION public.party_access(p_action text, p_code text, p_token text, p_name text DEFAULT '', p_member uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
 RETURN jsonb_build_object('code',v_party.code,'selfId',v_self.id,'isHost',v_self.is_host,'members',v_members);
END;
$$;
REVOKE ALL ON FUNCTION public.party_access(text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.party_access(text,text,text,text,uuid) TO anon, authenticated, service_role;