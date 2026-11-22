# Plan review: party_plan privacy hardening (proposal only, nothing applied)

## Findings (verified in local main 642b86a)
- `party_plan` (0005, line 92) returns `v_state.options->v_state.plan_index` verbatim as `plan`. Any stored key, including `score`, reaches every member.
- `score` = min member satisfaction x weather factor (solver.ts:92). In a 2-person party this leaks the other member's budget or travel limit.
- `compromise` strings (solver.ts:89) contain counts: "Stretches the budget for N people", "Longer travel for N people". In small parties this identifies who went over a private limit.
- `outlierCount` is returned to everyone, and `outlierNames` (display names) only to the host (lines 91-93). Both identify members whose private availability blocked the plan.
- `party_plan_complete` stores `p_options` unchecked apart from array type and length ≤ 20, so the database relies on callers to sanitize.
- PR #10 fixes only new writes, and only in TypeScript (`toPublicPlanOptions`). Stored legacy rows still leak through the raw RPC, and compromise counts and outlier fields stay.

## Is SQL really needed?
Yes. The leaking boundary is the publicly callable `party_plan` RPC: any guest with a token can call it directly, bypassing the server function. An API-layer-only fix would leave legacy rows and direct callers exposed. TypeScript changes are still useful as defense in depth.

## Proposed migration (additive; via Lovable migration tool, no drizzle edits by hand)
1. New helper `public.party_plan_public_option(o jsonb) RETURNS jsonb`. It is IMMUTABLE, uses `SET search_path=public,pg_temp`, and has EXECUTE revoked from public, anon and authenticated (only the definer functions call it). It allowlists fields:
```sql
SELECT CASE WHEN o IS NULL OR jsonb_typeof(o)<>'object' THEN NULL ELSE jsonb_build_object(
  'venue', jsonb_build_object('placeId',o#>'{venue,placeId}','name',o#>'{venue,name}',
     'category',o#>'{venue,category}','priceTier',o#>'{venue,priceTier}',
     'location',o#>'{venue,location}','mapsUrl',o#>'{venue,mapsUrl}','outdoor',o#>'{venue,outdoor}'),
  'startAt',o->'startAt','endAt',o->'endAt','hoursUnknown',o->'hoursUnknown','weather',o->'weather',
  'compromise', CASE
     WHEN o->>'compromise' ~ '(budget|travel)' AND o->>'compromise' ~ 'uncomfortable'
       THEN 'Some trade-offs on cost or travel · Outdoor conditions may be uncomfortable'
     WHEN o->>'compromise' ~ '(budget|travel)' THEN 'Some trade-offs on cost or travel'
     WHEN o->>'compromise' ~ 'uncomfortable' THEN 'Outdoor conditions may be uncomfortable'
     ELSE 'Works for everyone' END) END
```
2. `CREATE OR REPLACE public.party_plan` with the same signature, body, locks, capability checks and grants. Only the final RETURN projection changes:
   - `'plan', public.party_plan_public_option(v_state.options->v_state.plan_index)`
   - Replace `'outlierCount'` with `'noPlanReason'`, which is `'no_overlap'` when outliers is non-empty, `'no_venue_or_slot'` when status is no_plan with no outliers, otherwise null.
   - Drop the `outlierNames` host branch and the `v_outliers` query.
3. `CREATE OR REPLACE public.party_plan_complete` with the same signature, lease checks and service-role-only grant. It stores `(SELECT coalesce(jsonb_agg(public.party_plan_public_option(e)),'[]') FROM jsonb_array_elements(p_options) e)`, so the database sanitizes new writes whatever the caller sends. It keeps the `outliers` uuid[] column (needed to tell whether a plan failed for lack of overlap, never returned).
4. Optional one-time backfill, only if you approve it: `UPDATE party_planning SET options = <sanitized>` for rows with non-empty options. Step 2 already protects reads, so the backfill only removes data at rest. It is idempotent, does not touch status, revision, votes or plan_index, and leaves optionCount the same.
- No changes to tables, RLS, guest capability hashing, `party_access`, row locks, lease logic, votes, reroll or finalize logic. The `party_plan_snapshot` and complete RPCs stay limited to the service role.

## No-plan UX tradeoff
- Recommended: everyone sees "Schedules don't overlap enough" with an action to adjust your own times. Nobody, the host included, sees names or counts.
- Alternative (not recommended): show the host only a count when the party has 4 or more members. With 2 or 3 members a count still identifies who blocked the plan.
- Each member can still privately check their own submitted window through `selfPreferences`.

## TypeScript / PR #10 alignment (after migration lands)
- `types.ts`: keep `planOptionSchema` (internal, with score) and `publicPlanOptionSchema`. `planningStateSchema.plan` uses the public schema. Remove `outlierCount` and `outlierNames`, add `noPlanReason: z.enum(['no_overlap','no_venue_or_slot']).nullable()`.
- `solver.ts`: keep `score` internal for sorting. Change compromise wording to count-free text matching the SQL categories, so the server and database agree.
- `service.server.ts`: keep `toPublicPlanOptions` before `party_plan_complete`. Places and fallback selection stay unchanged.
- PR #10's `privacy.test.ts` assertion `outlierCount: 0` and the `security.test.ts` `not.toHaveProperty("outlierNames")` check need updating to the new field.
- Order: migration first, then merge the TypeScript changes. Old clients parsing `outlierCount` would fail the zod check, so ship both in one release.

## Tests
Unit:
- The public option drops `score`, and its compromise text has no digits for all solver outputs.
- Places and fallback completion payloads carry no score.
Isolated database (PR #10 `describeIsolatedDatabase` harness, separate project only):
- Insert a legacy row through the service role with score, numeric compromise and outliers. Check that guest and host `read` return no score, no digits in compromise, and no outlierNames or outlierCount.
- Call `party_plan_complete` with unsanitized options. Check that the stored row is sanitized (service-role select).
- Run a no-plan scenario and check that `noPlanReason` is `no_overlap`, with the response identical for the host and a guest.
- Regressions: concurrent lock, stale lease, rerolls, finalize, revoked member, and direct calls to the snapshot or complete RPCs rejected for anon.

## Production data risk
Steps 1 to 3 change reads and writes only, and are reversible by redeploying the previous function bodies. The optional backfill permanently removes stored scores and count text. They cannot be recovered and nothing uses them after this change. Only the column options would be rewritten. Nothing is applied until you approve.
