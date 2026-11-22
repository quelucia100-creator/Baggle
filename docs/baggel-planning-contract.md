# Baggel planning v2 contract

## Migration strategy

Use the existing Lovable Cloud database, parties, members, and 64-character guest capabilities. Do not introduce anonymous Auth identities or replace existing tables/RPCs. Keep the existing 10-person limit and exact, opt-in map sharing. Planning's optional rough origin is separate from map sharing and is never included in roster responses.

Add private `party_preferences` (budget 0–4, local availability, travel 5–90 minutes, optional rounded origin), `party_planning` (configuration, lifecycle, private lock snapshot, stored public ranking), and `party_reroll_votes`. No direct anonymous/authenticated table access; RLS enabled. `party_plan` verifies capabilities via existing membership RPC and returns only caller preferences plus submission booleans, counts, and the current plan. Hosts never receive others' preferences. Outlier names are host-only; scores and compromise text contain no per-member costs.

## Lifecycle and service boundary

`collecting → locking → locked | no_plan`; only `locked → final`, and the host can reopen `no_plan`. Preferences/configuration freeze during locking. Beginning a lock holds the existing party row lock, requires host plus two active submissions, captures an immutable private snapshot, and issues a unique lease. Concurrent/repeated requests return the existing lifecycle, not another job. Only service-role `party_plan_snapshot` and `party_plan_complete` can read the snapshot/write ranking, and both require the lease. Expired leases can be retried after 30 seconds; stale completion is rejected. Failures return collecting without deleting submissions.

Group votes require active submitted members, a current revision, and a remaining option. Threshold is ceil(active submitted members / 2), shared pool three; duplicate votes are idempotent. Host rerolls have no cap but consume a pool slot while the group pool remains. Every advance increments revision and invalidates old votes. Finalization and recovery are host-only.

## Solver and venues

Pure TypeScript ranking uses America/Montreal civil time, half-hour starts, midnight-aware overlap/opening periods, minimum member satisfaction, mean satisfaction, earliest start, rating, then place ID. Free-tier amendment is adopted: budgets/prices 0–4, budget overage divided by four. Seasonal snow exemptions remain unadopted. Weather penalties apply to every overlapping hourly interval, not only the start hour. Unknown hours/prices remain explicitly unknown.

Initial fallback catalogue is a small, clearly labelled Montreal public-space pool, not the original project's unverified demo seed. Live Places integration and a verified expanded venue seed belong to the venue developer. Server-side Open-Meteo forecast is best-effort and bounded; forecast outage produces a neutral penalty and unavailable forecast. Rankings are stored once and never recomputed for rerolls.

## Delivery boundary

This change supplies database contracts, callable server functions, solver, and tests. Existing guest/auth/map UI and blank event buttons are preserved; planning screens are a separate workstream. No branch switch/merge is performed by the agent; Git settings control the synced branch.

## Verified delivery

The results below describe the original v2 delivery. To rerun the database suites, use a separate authorized Supabase project with the v2 RPCs installed. Set `PLANNING_DB_TESTS=1` and supply `PLANNING_TEST_SUPABASE_URL`, `PLANNING_TEST_SUPABASE_PUBLISHABLE_KEY`, and `PLANNING_TEST_SUPABASE_SERVICE_ROLE_KEY` through the process environment. Run `npm test -- src/lib/party.test.ts src/lib/planning/security.test.ts`. The suites reject the configured app endpoint and clean up the test parties they create. A default `npm test` skips the database cases.

All 49 Vitest tests pass, including real-database capability isolation, denial of direct table/service-RPC access, private caller-only projections, revoked-member access, frozen preferences, concurrent lock computation, duplicate/stale votes, three group rerolls, host rerolls through the last option, finalization, failure rollback, expired lease recovery, and no-plan reopening. Solver tests cover free-budget fairness, travel normalization, Montreal midnight/DST, previous-day overnight hours, seasonal filtering, hourly rain/extreme-temperature penalties, unavailable forecasts, and deterministic ties.

Two real browser contexts created/joined a party and called the actual server-function RPC: private submissions, guest lock rejection, host ranking, shared plan read-back, guest reroll, host finalization, and persisted state after reload passed without page errors. Desktop/mobile screenshots confirm the original party UI and inactive event buttons remain unchanged. There is no planning UI yet, so no visible planning-screen workflow is claimed. Live forecast success is best-effort, not a release-certified provider check; live Places and the expanded venue catalogue are not implemented here. Latest preview build is OK. Changes stay on the existing `logic-integration` branch; no merge was performed.
