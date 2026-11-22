# Baggle v3 — accepted product BASE and implementation context

> **Status: product direction accepted as a BASE, engineering contract still PROPOSED.**
> Main collaboration log: [GitHub Agent Hub #4](https://github.com/quelucia100-creator/baggel/issues/4).
> This document does NOT supersede verified existing implementation details or authorize automatic schema changes. Reconcile with main and the latest hub comments.

## Purpose

Baggle (repo `baggel`) turns group planning into a fast, enjoyable activity with genuine discovery. Support **Make a Plan** (friends already intend to go out) and **Surprise Us** (the app inspires an outing) with one common, fun, functional flow.

## Target human experience

1. Host creates party with area/date/duration/mode; sends a six-character code/link/QR.
2. Friends join by name and privately enter **hard limits**: maximum budget (tiers 0–4), time interval (including overnight), travel maximum, optionally rough origin. No peer or host sees another person's limits.
3. All members choose up to two **public flavours**: `chill`, `explore`, `eat`, `play`, `sip`, `surprise`. Named contributions appear on a **Live Flavour Board**, updating across devices; board shows readiness.
4. Host begins **Bake** after at least two eligible members are ready. Server securely freezes participant IDs, config, preferences and flavours. Everyone sees an optional short synchronized reveal (never block reconnection on animation).
5. Discovery engine fetches real venues with an independent Montreal fallback; finds viable venue+time combinations, balances public tastes fairly, diversifies alternatives and explains the group-level rationale without identifying compromises.
6. Everyone gets **one shared recommendation**, including venue, time, map link, honest pricing and hours uncertainty, weather note, and "why this fits".
7. Group can **I'm down** (accept), **Another bite** (vote reroll), or privately **This won't work** (report a genuine feasibility issue). Proposed strict majority is `floor(n/2)+1` for acceptance and rerolls. Three shared rerolls, then host can advance through remaining options. Don't repeat same venue at nearby times.
8. Host finalizes an accepted viable option, or Baggle offers guided **private recipe repair** if no workable time/venue exists. Never expose an outlier's name or silently weaken their hard limit.

## Key product principles

- **Quick**: target under 30 seconds of personal input per member; no long polls or unnecessary animations.
- **Collaborative**: public flavours feel like jointly building a bagel; players contribute rather than argue in chat.
- **Discovery with integrity**: mixed flavours (Chill+Explore, Eat+Play) should create worthwhile combinations; "Surprise" is novelty openness, not a venue category. Varied suggestions must still satisfy real constraints.
- **Privacy**: public named flavours and readiness vs private budgets, times, distances, origins and private blockers.
- **Safety/accuracy**: verified closed => reject; missing hours => warn or exclude under policy; unknown price is not free; uncertain travel estimate is not a guarantee; missing forecast => caveat/conservative indoor preference.
- **Consistency**: store ranked options for a bake; rerolls traverse the frozen list, not live re-query.
- **Trust**: offer specific, actionable explanations for no common time / budget / distance / open venue / outdoor weather / provider failure rather than "no results".
- **No additional poll by default**: flavour showdown is optional future polish, not core.

## Actual code at inspected main `d5dedc5` (2026-11-21 ET)

- Lovable-backed React/TanStack Start app, Supabase RPC with guest capability tokens, not original v2 anonymous Auth + Edge Functions.
- Core party routes `src/routes/party.$code.tsx`, `src/routes/party.$code_.map.tsx`; existing copyable code/link, member roster, map; Find Event/vote UI currently disabled.
- Planning: `src/lib/planning.functions.ts`, `src/lib/planning/service.server.ts`, `src/lib/planning/types.ts`, `src/lib/planning/solver.ts`, `src/lib/planning/forecast.server.ts`, `src/lib/planning/venues.ts`.
- Schema: `party_preferences`, `party_planning`, `party_reroll_votes`; `party_plan` RPC with private lock lease, snapshots, reroll/finalize/reopen. See `docs/baggel-planning-contract.md`.
- Algorithm supports Montreal time and overnight windows. Existing fallback has **three outdoor public locations**. Live Google Places (New) is NOT wired into the planning lock. Open-Meteo hourly forecast client exists.
- Current solver scores budget and travel overruns instead of excluding them. Current SQL group vote threshold `ceil(n/2)` isn't a strict majority. Host outlier-name projection conflicts with v3 privacy. Repeated time slots can dominate rerolls. Current map automatically requests exact location: consider UX/privacy consent separately.
- Planning UI, live flavour board, QR rendering, acceptance, private plan blocker reporting, and richer recovery are missing.
- Previous contract reports 49 tests and two-browser backend checks passed during earlier implementation; **not rerun in this documentation pass**.

## Architecture to preserve

- Preserve existing `parties` and `party_members`, 10-person cap, membership capability tokens, current auth/guest navigation, Supabase project and deployed Lovable app.
- `AGENTS.md` Lovable block controls schema and generated files. **Do not edit `drizzle/`, `supabase/migrations/` or generated client files directly.** Coordinate schema changes with Lovable.
- Agent A owns state/security/orchestration; Agent B owns pure matching/venue discovery. Share a frozen `BagglePlanningSnapshot -> BaggleRecommendationResult` TypeScript contract before parallel implementation.
- The older `docs/hangout-flow-v2-reference.md` is an incompatible historical reference and should not drive current architecture.

## Open contract decisions requiring sign-off

1. Exact snapshot and result DTOs, safe error reasons, and venue evidence flags.
2. How "I'm down" acceptance and private blockers relate to finalization.
3. Conservative handling of unknown price/hours and uncertain travel estimates.
4. When/if a friend can join after locking and host recovery semantics.
5. Live-board transport: safe public projection with polling fallback vs Realtime.
6. Server policy and provider limits for live Google Places, verifying content retention restrictions.

## Roles and handoffs

- **Agent A**: product architecture and secure group lifecycle — [issue #5](https://github.com/quelucia100-creator/baggel/issues/5).
- **Agent B**: matchmaking/discovery/venues — [issue #6](https://github.com/quelucia100-creator/baggel/issues/6).
- Shared ongoing progress and decisions — [hub #4](https://github.com/quelucia100-creator/baggel/issues/4).

Before acting, read newest issue comments and main commits. Update hub after decisions, blockers and PR milestones. No direct or automatic cross-chat messaging is implied.
