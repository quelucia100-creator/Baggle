ALTER TABLE public.parties ADD COLUMN disbanded_at timestamptz;
ALTER TABLE public.party_members ADD COLUMN left_at timestamptz;
CREATE TABLE public.party_account_members (
 member_id uuid PRIMARY KEY REFERENCES public.party_members(id) ON DELETE CASCADE,
 party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 UNIQUE(party_id,user_id)
);
GRANT ALL ON public.party_account_members TO service_role;
REVOKE ALL ON public.party_account_members FROM PUBLIC, anon, authenticated;
ALTER TABLE public.party_account_members ENABLE ROW LEVEL SECURITY;

DO $migration$
DECLARE src text; needle text := ' IF v_self.removed THEN RAISE EXCEPTION ''You have been removed from this party.''; END IF;';
BEGIN
 src := pg_get_functiondef('public.party_access(text,text,text,text,uuid)'::regprocedure);
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'Unexpected party_access baseline'; END IF;
 src := replace(src,needle,$addition$
 IF v_party.disbanded_at IS NOT NULL THEN RAISE EXCEPTION 'This party has been disbanded.' USING ERRCODE='55000'; END IF;
 IF p_action='join' AND v_self.removed AND v_self.left_at IS NOT NULL THEN
  IF (SELECT count(*) FROM public.party_members WHERE party_id=v_party.id AND NOT removed)>=10 THEN RAISE EXCEPTION 'This party is full (10 people maximum).'; END IF;
  UPDATE public.party_members SET removed=false,left_at=NULL,status_view=true,display_name=trim(p_name) WHERE id=v_self.id RETURNING * INTO v_self;
 END IF;
 IF v_self.removed THEN
  IF v_self.left_at IS NOT NULL THEN RAISE EXCEPTION 'You have left this party. Join this party again to return.' USING ERRCODE='55000'; END IF;
  RAISE EXCEPTION 'You have been removed from this party.';
 END IF;
$addition$);
 EXECUTE src;
END $migration$;
REVOKE ALL ON FUNCTION public.party_access(text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.party_access(text,text,text,text,uuid) TO anon,authenticated,service_role;

CREATE FUNCTION public.party_social(p_action text,p_code text,p_token text,p_member uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE a jsonb; pid uuid; sid uuid; me uuid:=auth.uid(); owner_id uuid; target_name text; next_host uuid; linked uuid; items jsonb;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('attach','list','request','leave','disband') THEN RAISE EXCEPTION 'Invalid party action'; END IF;
 a:=public.party_access('read',p_code,p_token);
 SELECT id INTO pid FROM public.parties WHERE code=a->>'code' FOR UPDATE;
 sid:=(a->>'selfId')::uuid;
 IF p_action IN ('leave','disband') THEN
  IF p_action='disband' AND (a->>'isHost')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Only the host can disband this party.' USING ERRCODE='42501'; END IF;
  IF p_action='leave' THEN
   UPDATE public.party_members SET removed=true,left_at=now(),is_host=false,latitude=NULL,longitude=NULL,location_updated_at=NULL WHERE id=sid;
   UPDATE public.party_preferences SET confirmed=false WHERE member_id=sid;
   UPDATE public.party_preferences_v3 SET submitted=false WHERE member_id=sid;
   IF (a->>'isHost')::boolean THEN
    SELECT id INTO next_host FROM public.party_members WHERE party_id=pid AND NOT removed ORDER BY joined_at,id LIMIT 1;
    IF next_host IS NOT NULL THEN UPDATE public.party_members SET is_host=true WHERE id=next_host; END IF;
   END IF;
  END IF;
  IF p_action='disband' OR NOT EXISTS(SELECT 1 FROM public.party_members WHERE party_id=pid AND NOT removed) THEN
   UPDATE public.parties SET disbanded_at=now(),journey_started=false,hangout=NULL,weather_cache=NULL,weather_cached_at=NULL,weather_key=NULL,event_state=NULL WHERE id=pid;
   UPDATE public.party_members SET removed=true,latitude=NULL,longitude=NULL,location_updated_at=NULL WHERE party_id=pid;
   UPDATE public.party_planning SET status='no_plan',revision=revision+1,options='[]',participants='{}',outliers='{}',lock_id=NULL,lock_snapshot=NULL,lock_started_at=NULL,venue_source=NULL WHERE party_id=pid;
  ELSE
   UPDATE public.party_planning SET status='collecting',revision=revision+1,lock_id=NULL,lock_snapshot=NULL,lock_started_at=NULL,participants='{}',options='[]',outliers='{}' WHERE party_id=pid AND status='locking';
  END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF me IS NULL THEN RAISE EXCEPTION 'Please sign in to add party friends.' USING ERRCODE='42501'; END IF;
 IF p_action='attach' THEN
  IF NOT EXISTS(SELECT 1 FROM public.account_preferences WHERE user_id=me AND completed AND username IS NOT NULL) THEN RETURN jsonb_build_object('ok',false); END IF;
  SELECT user_id INTO linked FROM public.party_account_members WHERE member_id=sid;
  IF linked IS NOT NULL AND linked<>me THEN RAISE EXCEPTION 'This membership belongs to another account.' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.party_account_members WHERE party_id=pid AND user_id=me AND member_id<>sid) THEN RAISE EXCEPTION 'Your account is already linked to another member of this party.' USING ERRCODE='42501'; END IF;
  INSERT INTO public.party_account_members(member_id,party_id,user_id) VALUES(sid,pid,me) ON CONFLICT(member_id) DO NOTHING;
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.party_account_members WHERE member_id=sid AND party_id=pid AND user_id=me) THEN RAISE EXCEPTION 'Link your own party membership first.' USING ERRCODE='42501'; END IF;
 IF p_action='request' THEN
  SELECT ap.username INTO target_name FROM public.party_account_members b JOIN public.party_members m ON m.id=b.member_id JOIN public.account_preferences ap ON ap.user_id=b.user_id WHERE b.member_id=p_member AND b.party_id=pid AND m.party_id=pid AND NOT m.removed AND b.user_id<>me AND ap.completed;
  IF target_name IS NULL THEN RAISE EXCEPTION 'Only registered members in this party can receive friend requests.' USING ERRCODE='42501'; END IF;
  RETURN public.friend_action('request',target_name);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('memberId',m.id,'username',ap.username,'relationship',coalesce((SELECT CASE WHEN f.status='accepted' THEN 'friend' WHEN f.requester_id=me THEN 'outgoing' ELSE 'incoming' END FROM public.friendships f WHERE least(f.requester_id,f.addressee_id)=least(me,b.user_id) AND greatest(f.requester_id,f.addressee_id)=greatest(me,b.user_id)),'none')) ORDER BY m.joined_at,m.id),'[]'::jsonb) INTO items
 FROM public.party_account_members b JOIN public.party_members m ON m.id=b.member_id JOIN public.account_preferences ap ON ap.user_id=b.user_id WHERE b.party_id=pid AND m.party_id=pid AND NOT m.removed AND m.id<>sid AND ap.completed;
 RETURN jsonb_build_object('ok',true,'items',items);
END $function$;
REVOKE ALL ON FUNCTION public.party_social(text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.party_social(text,text,text,uuid) TO anon,authenticated,service_role;