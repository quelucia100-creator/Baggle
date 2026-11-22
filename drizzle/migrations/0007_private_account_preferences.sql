CREATE TABLE public.account_preferences (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 username text,
 date_of_birth date,
 tastes text[],
 dietary text[],
 accessibility text[],
 alcohol text,
 completed boolean NOT NULL DEFAULT false,
 CONSTRAINT account_username_format CHECK (username IS NULL OR username ~ '^[a-zA-Z0-9_]{3,30}$'),
 CONSTRAINT account_alcohol_choice CHECK (alcohol IS NULL OR alcohol IN ('avoid','comfortable','no_preference')),
 CONSTRAINT account_tastes_choices CHECK (tastes IS NULL OR (cardinality(tastes)>0 AND tastes <@ ARRAY['Food & cafes','Outdoors','Arts & culture','Games','Sports','Live music','Exploring']::text[])),
 CONSTRAINT account_dietary_choices CHECK (dietary IS NULL OR (cardinality(dietary)>0 AND dietary <@ ARRAY['None','Vegetarian','Vegan','Halal','Kosher','Gluten-free','Dairy-free','Nut allergy','Other']::text[] AND (NOT ('None'=ANY(dietary)) OR cardinality(dietary)=1))),
 CONSTRAINT account_accessibility_choices CHECK (accessibility IS NULL OR (cardinality(accessibility)>0 AND accessibility <@ ARRAY['None','Step-free access','Accessible toilets','Seating available','Low-noise spaces','Other']::text[] AND (NOT ('None'=ANY(accessibility)) OR cardinality(accessibility)=1))),
 CONSTRAINT account_setup_complete CHECK (NOT completed OR (username IS NOT NULL AND date_of_birth IS NOT NULL AND tastes IS NOT NULL AND dietary IS NOT NULL AND accessibility IS NOT NULL AND alcohol IS NOT NULL))
);
GRANT SELECT, INSERT, UPDATE ON public.account_preferences TO authenticated;
GRANT ALL ON public.account_preferences TO service_role;
ALTER TABLE public.account_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own account preferences" ON public.account_preferences FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Insert own account preferences" ON public.account_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Update own account preferences" ON public.account_preferences FOR UPDATE TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE UNIQUE INDEX account_preferences_username_unique ON public.account_preferences (lower(username));
CREATE FUNCTION public.validate_account_birth_date() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN
 IF NEW.date_of_birth IS NOT NULL AND (NEW.date_of_birth > CURRENT_DATE OR NEW.date_of_birth < DATE '1900-01-01') THEN RAISE EXCEPTION 'Choose a valid date of birth'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_account_birth_date BEFORE INSERT OR UPDATE ON public.account_preferences FOR EACH ROW EXECUTE FUNCTION public.validate_account_birth_date();