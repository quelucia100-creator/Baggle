# Cookie Monster × Baggel integration — review and handoff

**Status: NOT MERGE-READY for a combined functional app.** This branch brings the original product requirements into the Lovable repo for review. It does not change deployed code, the Supabase database, or Lovable-managed files.

## Repositories and baseline (2026-11-21)

- Lovable app / intended surviving repository: `quelucia100-creator/baggel`, `main` at `3ffce7e`.
- Original backend/source specification: `SeriousParkyPark/cookie-monster`, `main` at `1f3a19f`.
- Source requirements: [hangout-flow-v2-reference.md](docs/hangout-flow-v2-reference.md), taken from `cookie-monster/.plans/hangout-flow-v2-spec.md`.
- The original Django modules are superseded. **Do not copy or run them.**
- The original Supabase schema/RLS/privacy test exist, and its STATUS.md *reports* a passing 36-assertion pgTAP test against **its own** live Supabase project. They are **not** an implementation of this Lovable app.

## Compatibility findings — blockers, not ordinary Git conflicts

1. **Different live Supabase projects.** The original `cookie-monster` status documents a different project from `baggel/.env` and `baggel/supabase/config.toml`. Do not switch URLs/keys or run the original migrations on the Lovable database.
2. **Different data models.** The original defines `hangouts`, `members`, `member_status`, `venues`, `plan_options`, `reroll_votes`. Baggel currently uses `parties`, `party_members`, `profiles`, plus `party_access`, `party_journey`, `party_event` RPCs.
3. **Different identity/authorization.** The original assumes Supabase anonymous sign-in and `auth.uid()`. Baggel's guest parties use per-browser random capability tokens hashed/verified by security-definer RPCs. A direct SQL or UI copy would break membership and privacy.
4. **Different route/feature contracts.** Original target `/h/:code`, private per-member budget, time, travel forms, automatic venue ranking, lock and group reroll. Baggel currently has `/party/:code` / map, a 10-person party limit, optional exact live location, and disabled event-vote/reroll UI. The original specifies up to 12 participants and approximate, undisclosed locations — resolve those privacy/capacity choices before release.
5. **Different provider integrations.** Baggel has a membership-verified Google Maps weather lookup and Google Maps view; the original target calls Google Places (New) at lock time, Open-Meteo for hourly forecast, and uses a seeded venue fallback. Existing Baggel weather is not the venue-selection pipeline.
6. **Lovable owns schema and generated files.** Per `AGENTS.md`, do not edit `supabase/migrations/`, `drizzle/`, or generated clients directly. Make DB changes through Lovable and regenerate types there.
7. **No GitHub Actions runs** are listed for either repository at the inspected heads, so this review does not claim a passing integration build. Baggel has Vitest tests; manually run and verify them after any runtime change.
8. **Environment hygiene:** Baggel tracks a `.env` file. Only publishable/browser keys were identified by variable names in this review; audit values/permissions and restrict Google Maps browser keys. Keep secret/service role keys out of commits and browser bundles.

## Implementation approach (keep the working Baggel app)

**Do not combine the two unrelated histories or overwrite `baggel/main`.** Integrate feature-by-feature in reviewable pull requests, using the Lovable-connected Baggel repo as the source of truth.

1. **DB & permissions (owner B / Lovable):** Pick **one** target Supabase project (the one the live Baggel app uses). Extend Baggel's existing `parties` and `party_members` *or* explicitly migrate them in a controlled plan. Store private member budgets/free windows/travel limits behind capability-validated RPCs; members cannot read other members' preferences, even when host. Add privacy-safe submission status and tests. Document and reconcile the group-size and location privacy differences. Do not expose individual preferences in Realtime.
2. **Solver & lock (owner C):** Port the *algorithm in the reference spec* as pure tested TypeScript; don't assume the original repo has an implementation (it doesn't). Add an atomic host-only lock guard (>=2 submitted), consistent Montreal date/overnight handling, ranked/stored plans, no-plan recovery, host finalization, and shared reroll voting.
3. **Venues/weather (owner D):** Seed verified Montreal venues including price tier 0 and build an offline-first fallback. Add server-side Places (New) with restricted key and timeout, plus forecast/season/hours-aware scoring. Never put service-role credentials or Places API keys in browser code. Avoid reusing Google Maps *weather* response as hourly Open-Meteo forecast without reconciling fields.
4. **UI (owner A / Lovable):** Preserve Baggel's functioning authentication, guest-party creation, host-only removal and map navigation. Add private preference form; public counts only; host Find our plan; reveal; venue and time result; rerolls; host finalize. Existing event choices and reroll buttons are intentionally disabled, not complete.
5. **Release:** Verify test suite, database privacy test with multiple real identities, double-lock race, 2-phone join/submit/reveal, group/host rerolls, zero-budget venue, bad-weather/outdoor handling, fallback when Places is down, timezone/overnight case, and full mobile demo.

## Acceptance checklist before any *functional* merge to main

- [ ] The working Lovable project and target Supabase project are explicitly chosen.
- [ ] Auth, membership and RLS/privacy verified for host and non-host.
- [ ] Private budget/time/travel form and submission status work end to end.
- [ ] Lock is host-only, requires at least 2 submitted, is idempotent under double-click.
- [ ] Ranked venue/time solver passes unit tests, including midnight and fairness.
- [ ] Venue seed and outage fallback are deployed and tested.
- [ ] Host and group rerolls, finalization and no-plan paths work.
- [ ] Google Places, forecast, opening hours and seasonal behavior are tested.
- [ ] Frontend build + tests pass; no secret values committed.
- [ ] Full phone demo passes and the deployment continues to work with Lovable sync.

## Current testing evidence (not comprehensive)

- Baggel: source tests in `src/lib/*.test.ts`, `src/test/` and `tests/navigation_back.py`, but no Actions runs were listed; live map render and sign-in recovery remain unverified per `roadmap.md`.
- Original cookie-monster: database/privacy tests reported passing by its `.plans/STATUS.md`, **on its own Supabase environment**. Its planned solver, lock/reroll functions and demo venue seed were not present on main at the inspected commit.

**Merge safety:** This PR copies only reference documentation and does not perform the incompatible source-history merge or alter the production backend. Keep it draft until a teammate confirms the target data/identity architecture.
