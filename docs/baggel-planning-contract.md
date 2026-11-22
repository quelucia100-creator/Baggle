# Baggel planning v2 contract

Planning uses the existing Lovable Cloud database, ten-person parties, and browser-held guest capabilities. The capability-verified `party_plan` RPC returns the caller’s own preferences, member readiness, and the current shared result. The planning origin is rounded, separate from map sharing, and private. Direct access to planning tables and service-only RPCs is denied to application clients.

## Lifecycle and privacy

- `collecting → locking → locked | no_plan`. A host lock requires at least two active submissions and captures a frozen snapshot under the party row lock. Only the service role can read the snapshot or complete a current lease. Concurrent requests use the existing job. Leases expire after 30 seconds and stale completions are rejected. Failed computation preserves submissions for retry.
- Members included in the lock can vote for the current revision. The threshold is the ceiling of half the active submitted members, and the shared allowance is three rerolls. Duplicate votes count once. The host can advance through the remaining options after that allowance. Each advance increments the revision and discards old votes.
- The host can finalize a locked option or reopen a no-plan result. Rerolls and finalization use the stored options.
- Lovable migrations `0009` and `0010` project stored and newly written options to the shared schema. Shared plans have no score, outlier counts or identities, or member-derived compromise text. The compromise is always “Review this option”. The no-plan reason is `no_match` or null. The application also projects the response and keeps lease details internal.

## Solver and venues

The solver uses Montreal civil time and half-hour starts. A candidate needs continuous coverage by every participant’s availability and the venue’s regular opening hours, with overnight coverage supported. The venue must have a confirmed price tier within every budget. Estimated travel must meet every limit using the rough origin or configured meeting area and the existing model of five minutes plus four minutes per straight-line kilometre. Actual routes, holiday hours, and booking availability can differ.

Feasible options rank by weather score, then earliest start, venue rating, and place ID. Outdoor weather penalties consider every overlapping forecast hour. Open-Meteo is best-effort. Google Places Nearby Search runs at lock time when configured, and the service uses the sourced Montreal catalogue if the search fails or supplies no feasible options. Either source can produce no plan. The saved ranking records its source and never needs recomputation for a reroll.

## Verification and frontend

- Planning screens now exist: the map's "Plan the hangout" opens a one-question-per-screen wizard (budget, time, travel radius, vibe) that saves through `save`. Only the host's vibe is used, sent as `config.category` through `configure` before `lock`; a per-member vibe is not stored by the backend.

See [the frontend handoff](FRONTEND-HANDOFF.md) for the TanStack Start call contract. Default Vitest runs skip the real database cases. To enable them, use an authorized isolated Supabase project with the current Lovable migrations. Set `PLANNING_DB_TESTS=1` and provide `PLANNING_TEST_SUPABASE_URL`, `PLANNING_TEST_SUPABASE_PUBLISHABLE_KEY`, and `PLANNING_TEST_SUPABASE_SERVICE_ROLE_KEY` in the process environment. The preflight rejects application endpoints and keys, and restricts requests to the isolated origin. The tests create and clean up their own parties.
