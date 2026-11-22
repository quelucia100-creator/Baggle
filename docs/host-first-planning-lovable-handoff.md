# Lovable database handoff: host-first, multi-day planning

Paste this file into Lovable and ask it to apply the SQL below as a new migration, then
regenerate `src/integrations/supabase/types.ts`. Per `AGENTS.md`, the schema is changed in
Lovable, not by committing files to `drizzle/`.

**Apply this before (or together with) merging `feat/host-first-planning`.** The slider
wizard calls `party_plan_days`; until it exists, the plan page shows "Couldn't check the
hangout's days" instead of the questions.

## What it does

| Change | Purpose |
| --- | --- |
| `party_planning.candidate_dates date[]` | The host's offered days (empty = today only). |
| `party_preference_days` (private table) | Each member's free stretches per offered day. RLS on, no client grants. |
| `party_host_ready(party)` | True once the host has saved answers (V2 row, or a submitted V3 row). |
| Trigger on `party_members` insert | New members can't join until the host is ready: `The host is still setting up this hangout.` The host's own row is always allowed; rejoining members are unaffected. |
| `party_plan_days(action, code, token, payload)` | Capability-verified RPC. `read` → `{dates, selfWindows, hostReady}`; `configure` (host) sets the days plus the host's own windows atomically and, if the days changed, deletes every other member's answers; `save` stores the caller's windows. Callers only ever see their own windows. |
| `party_plan_snapshot` (replaced) | Same checks as 0011; for V2 parties it adds `config.dates` (past days dropped) and each participant's `dayWindows` to the lock snapshot. |
| `invite_group_to_journey` (replaced) | Returns `host_not_ready` until the host has finished. |

Note: the join gate applies to every party, including existing parties whose host has not
answered yet and V3 parties.

## SQL

```sql
-- Host-first planning for the slider wizard (schema version 2 parties).
-- 1. Nobody new can join a party until the host has saved all of their own answers.
-- 2. The host can offer several candidate days; members answer a free window per day.
-- 3. Changing the offered days resets every other member's readiness.
-- Additive only: party_plan is unchanged; days live beside it and join the lock snapshot.

ALTER TABLE public.party_planning
  ADD COLUMN IF NOT EXISTS candidate_dates date[] NOT NULL DEFAULT '{}';
ALTER TABLE public.party_planning DROP CONSTRAINT IF EXISTS party_planning_candidate_dates_check;
ALTER TABLE public.party_planning
  ADD CONSTRAINT party_planning_candidate_dates_check CHECK (cardinality(candidate_dates) <= 7);

CREATE TABLE IF NOT EXISTS public.party_preference_days (
  member_id uuid PRIMARY KEY REFERENCES public.party_members(id) ON DELETE CASCADE,
  windows jsonb NOT NULL CHECK (jsonb_typeof(windows) = 'object' AND pg_column_size(windows) < 16384),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.party_preference_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.party_preference_days FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.party_preference_days TO service_role;

-- True once the party's host has saved their own planning answers (V2 or V3).
CREATE OR REPLACE FUNCTION public.party_host_ready(p_party uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.party_members m
    WHERE m.party_id = p_party AND m.is_host AND NOT m.removed
      AND (EXISTS (SELECT 1 FROM public.party_preferences p WHERE p.member_id = m.id)
        OR EXISTS (SELECT 1 FROM public.party_preferences_v3 p WHERE p.member_id = m.id AND p.submitted))
  );
$$;
REVOKE ALL ON FUNCTION public.party_host_ready(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.party_host_ready(uuid) TO service_role;

-- Join gate: covers every path that adds a member (party_access 'join').
-- The host's own row (created with the party) is always allowed.
CREATE OR REPLACE FUNCTION public.party_members_require_host_setup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.is_host THEN RETURN NEW; END IF;
  IF NOT public.party_host_ready(NEW.party_id) THEN
    RAISE EXCEPTION 'The host is still setting up this hangout.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.party_members_require_host_setup() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS party_members_require_host_setup ON public.party_members;
CREATE TRIGGER party_members_require_host_setup
  BEFORE INSERT ON public.party_members
  FOR EACH ROW EXECUTE FUNCTION public.party_members_require_host_setup();

-- Validates {"YYYY-MM-DD": [{"freeFrom": "HH:MM", "freeTo": "HH:MM"}, ...]} against the offered
-- days. A day can hold several free stretches (say, busy at midday); at most 24 per day.
CREATE OR REPLACE FUNCTION public.party_day_windows(p jsonb, p_dates date[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE v_key text; v_value jsonb; v_window jsonb; v_day jsonb; v_out jsonb := '{}'::jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'Invalid day windows.'; END IF;
  FOR v_key, v_value IN SELECT * FROM jsonb_each(p) LOOP
    IF v_key !~ '^\d{4}-\d{2}-\d{2}$' OR NOT (v_key::date = ANY(p_dates)) THEN
      RAISE EXCEPTION 'Pick from the days the host offered.';
    END IF;
    IF jsonb_typeof(v_value) <> 'array' OR jsonb_array_length(v_value) NOT BETWEEN 1 AND 24 THEN
      RAISE EXCEPTION 'Invalid day windows.';
    END IF;
    v_day := '[]'::jsonb;
    FOR v_window IN SELECT * FROM jsonb_array_elements(v_value) LOOP
      IF jsonb_typeof(v_window) <> 'object'
         OR coalesce(v_window->>'freeFrom', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
         OR coalesce(v_window->>'freeTo', '') !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
        RAISE EXCEPTION 'Invalid day windows.';
      END IF;
      v_day := v_day || jsonb_build_array(jsonb_build_object('freeFrom', v_window->>'freeFrom', 'freeTo', v_window->>'freeTo'));
    END LOOP;
    v_out := v_out || jsonb_build_object(v_key, v_day);
  END LOOP;
  IF v_out = '{}'::jsonb THEN RAISE EXCEPTION 'Pick at least one day that works for you.'; END IF;
  RETURN v_out;
END;
$$;

-- Capability-verified (same membership token as party_plan). Actions:
--   read      -> { dates, selfWindows, hostReady }
--   configure -> host only; payload { dates: [] | ["YYYY-MM-DD", ...], windows }
--                (with dates, the host's own windows are written in the same transaction)
--   save      -> member; payload { windows: {...} } for a multi-day party
CREATE OR REPLACE FUNCTION public.party_plan_days(p_action text, p_code text, p_token text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_access jsonb; v_party uuid; v_self public.party_members; v_state public.party_planning;
  v_today date := (now() AT TIME ZONE 'America/Montreal')::date;
  v_dates date[]; v_windows jsonb;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('read','configure','save') THEN RAISE EXCEPTION 'Invalid planning action'; END IF;
  v_access := public.party_access('read', p_code, p_token);
  SELECT id INTO v_party FROM public.parties WHERE code = v_access->>'code' FOR UPDATE;
  SELECT * INTO v_self FROM public.party_members WHERE id = (v_access->>'selfId')::uuid;
  INSERT INTO public.party_planning(party_id) VALUES (v_party) ON CONFLICT DO NOTHING;
  SELECT * INTO v_state FROM public.party_planning WHERE party_id = v_party FOR UPDATE;

  IF p_action = 'configure' THEN
    IF NOT v_self.is_host THEN RAISE EXCEPTION 'Only the host can manage planning.'; END IF;
    IF v_state.status <> 'collecting' OR v_state.schema_version <> 2 THEN RAISE EXCEPTION 'Planning configuration is frozen.'; END IF;
    IF p_payload IS NULL OR jsonb_typeof(p_payload->'dates') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'dates') > 7 THEN
      RAISE EXCEPTION 'Invalid planning configuration.';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'dates') d
               WHERE jsonb_typeof(d) <> 'string' OR d #>> '{}' !~ '^\d{4}-\d{2}-\d{2}$') THEN
      RAISE EXCEPTION 'Invalid planning configuration.';
    END IF;
    SELECT coalesce(array_agg(DISTINCT (d #>> '{}')::date ORDER BY (d #>> '{}')::date), '{}')
      INTO v_dates FROM jsonb_array_elements(p_payload->'dates') d;
    IF EXISTS (SELECT 1 FROM unnest(v_dates) x WHERE x < v_today OR x > v_today + 7) THEN
      RAISE EXCEPTION 'Pick days in the coming week.';
    END IF;
    -- Validate the host's own windows before changing anything.
    IF cardinality(v_dates) > 0 THEN
      v_windows := public.party_day_windows(p_payload->'windows', v_dates);
    END IF;
    -- Today-only parties keep an empty list and plan for today.
    IF v_dates IS DISTINCT FROM v_state.candidate_dates OR coalesce(v_dates[1], v_today) <> v_state.event_date THEN
      DELETE FROM public.party_preferences p USING public.party_members m
        WHERE p.member_id = m.id AND m.party_id = v_party AND NOT m.is_host;
      DELETE FROM public.party_preference_days p USING public.party_members m
        WHERE p.member_id = m.id AND m.party_id = v_party;
      UPDATE public.party_planning
        SET candidate_dates = v_dates, event_date = coalesce(v_dates[1], v_today), revision = revision + 1
        WHERE party_id = v_party
        RETURNING * INTO v_state;
    END IF;
    IF v_windows IS NOT NULL THEN
      INSERT INTO public.party_preference_days(member_id, windows) VALUES (v_self.id, v_windows)
        ON CONFLICT (member_id) DO UPDATE SET windows = excluded.windows, updated_at = now();
    END IF;
  ELSIF p_action = 'save' THEN
    IF v_state.status <> 'collecting' THEN RAISE EXCEPTION 'Preferences are locked.'; END IF;
    IF cardinality(v_state.candidate_dates) = 0 THEN RAISE EXCEPTION 'This hangout is for one day only.'; END IF;
    v_windows := public.party_day_windows(p_payload->'windows', v_state.candidate_dates);
    INSERT INTO public.party_preference_days(member_id, windows) VALUES (v_self.id, v_windows)
      ON CONFLICT (member_id) DO UPDATE SET windows = excluded.windows, updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'dates', to_jsonb(v_state.candidate_dates),
    'selfWindows', (SELECT windows FROM public.party_preference_days WHERE member_id = v_self.id),
    'hostReady', public.party_host_ready(v_party)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.party_plan_days(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.party_plan_days(text,text,text,jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.party_day_windows(jsonb,date[]) FROM PUBLIC, anon, authenticated;

-- Lock snapshot (service role): same checks as 0011, and for V2 parties it adds the host's
-- candidate days (past days dropped) and each participant's per-day windows.
CREATE OR REPLACE FUNCTION public.party_plan_snapshot(p_code text, p_lease uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_snapshot jsonb; v_state public.party_planning;
  v_today date := (now() AT TIME ZONE 'America/Montreal')::date;
  v_dates jsonb; v_windows jsonb;
BEGIN
 SELECT s.* INTO v_state FROM public.party_planning s JOIN public.parties p ON p.id=s.party_id
  WHERE p.code=upper(p_code) AND s.lock_id=p_lease AND s.status='locking' AND s.lock_started_at > now()-interval '30 seconds'
    AND NOT EXISTS (SELECT 1 FROM public.party_members m WHERE m.id=ANY(s.participants) AND m.removed)
    AND (s.schema_version=2 OR (s.lock_snapshot->>'revision')::integer = s.revision);
 v_snapshot := v_state.lock_snapshot;
 IF v_snapshot IS NULL THEN RAISE EXCEPTION 'Planning lease is no longer valid.'; END IF;
 IF v_state.schema_version <> 2 OR cardinality(v_state.candidate_dates) = 0 THEN RETURN v_snapshot; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d), '[]'::jsonb) INTO v_dates
   FROM unnest(v_state.candidate_dates) d WHERE d >= v_today;
 IF jsonb_array_length(v_dates) = 0 THEN v_dates := jsonb_build_array(to_jsonb(v_today)); END IF;
 SELECT coalesce(jsonb_object_agg(d.member_id::text,
          (SELECT coalesce(jsonb_object_agg(w.key, w.value), '{}'::jsonb) FROM jsonb_each(d.windows) w WHERE w.key::date >= v_today)),
        '{}'::jsonb)
   INTO v_windows FROM public.party_preference_days d WHERE d.member_id = ANY(v_state.participants);
 RETURN jsonb_set(v_snapshot, '{config,dates}', v_dates)
   || jsonb_build_object('members', (
        SELECT coalesce(jsonb_agg(CASE WHEN v_windows ? (m->>'id') THEN m || jsonb_build_object('dayWindows', v_windows->(m->>'id')) ELSE m END), '[]'::jsonb)
        FROM jsonb_array_elements(v_snapshot->'members') m));
END; $function$;
REVOKE ALL ON FUNCTION public.party_plan_snapshot(text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.party_plan_snapshot(text,uuid) TO service_role;

-- Group invites wait until the host has finished setting up.
CREATE OR REPLACE FUNCTION public.invite_group_to_journey(p_group uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); my_name text; n integer; v_party uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id = p_group AND user_id = me AND status = 'member') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_allowed');
  END IF;
  SELECT id INTO v_party FROM public.parties WHERE code = upper(p_code);
  IF v_party IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_journey');
  END IF;
  IF NOT public.party_host_ready(v_party) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'host_not_ready');
  END IF;
  SELECT username INTO my_name FROM public.account_preferences WHERE user_id = me;
  INSERT INTO public.notifications (user_id, kind, actor_username, detail)
    SELECT m.user_id, 'journey_invite', my_name, upper(p_code)
    FROM public.friend_group_members m WHERE m.group_id = p_group AND m.status = 'member' AND m.user_id <> me;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.friend_groups SET updated_at = now() WHERE id = p_group;
  RETURN jsonb_build_object('ok', true, 'invited', n);
END $$;
REVOKE ALL ON FUNCTION public.invite_group_to_journey(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_group_to_journey(uuid, text) TO authenticated;
```
