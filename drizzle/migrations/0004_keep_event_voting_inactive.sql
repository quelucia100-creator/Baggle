REVOKE EXECUTE ON FUNCTION public.party_event(text,text,text,text,uuid,double precision,double precision,uuid) FROM anon, authenticated, service_role;
COMMENT ON FUNCTION public.party_event(text,text,text,text,uuid,double precision,double precision,uuid) IS 'Inactive: event controls are presentation-only pending event choices and voting requirements.';
COMMENT ON COLUMN public.parties.event_state IS 'Inactive: reserved for future event voting; not used by the app.';
COMMENT ON COLUMN public.party_members.event_vote IS 'Inactive: reserved for future event voting; not used by the app.';
COMMENT ON COLUMN public.party_members.event_round IS 'Inactive: reserved for future event voting; not used by the app.';