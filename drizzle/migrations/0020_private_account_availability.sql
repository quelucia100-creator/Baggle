CREATE TABLE public.account_availability (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 available_date date NOT NULL,
 busy_slots smallint[] NOT NULL DEFAULT '{}',
 confirmed boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id, available_date),
 CONSTRAINT account_availability_slot_bounds CHECK (cardinality(busy_slots) <= 60 AND array_position(busy_slots, NULL) IS NULL AND busy_slots <@ ARRAY[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]::smallint[])
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_availability TO authenticated;
GRANT ALL ON public.account_availability TO service_role;
REVOKE ALL ON public.account_availability FROM anon;
ALTER TABLE public.account_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own availability" ON public.account_availability FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
CREATE POLICY "Insert own availability" ON public.account_availability FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=user_id);
CREATE POLICY "Update own availability" ON public.account_availability FOR UPDATE TO authenticated USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
CREATE POLICY "Delete own availability" ON public.account_availability FOR DELETE TO authenticated USING ((SELECT auth.uid())=user_id);
COMMENT ON TABLE public.account_availability IS 'Private dated account availability. Busy slot indexes use the guest planning Montreal 30-minute day grid, including next-day spillover; unconfirmed dates do not imply availability.';