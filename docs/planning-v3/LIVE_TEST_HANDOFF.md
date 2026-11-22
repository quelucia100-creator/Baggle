# Cookie Monster / Baggel V3 — merged-code handoff and live-test plan
**Updated:** 2026-11-22 · **Repository:** `quelucia100-creator/baggel` · **Priority:** shortest safe route to a real two-person online pilot.

> **IMPORTANT: MERGED SOURCE IS NOT A RELEASE APPROVAL.** Database V3 contract, isolated SQL acceptance, live routing, and real two-browser integration remain unverified. Never assume an unpublished Lovable application implies the production database is untouched.

## 0. Exact current handoff

- **GitHub main source**: merged V3 UI, backend engine, and local-only synthetic demo via [PR #11](https://github.com/quelucia100-creator/baggel/pull/11), Git merge **`da489c8847c7fe19f5cb7aa9ede6e1b27e236ad1`**. PR #11 included the commits from [backend PR #12](https://github.com/quelucia100-creator/baggel/pull/12). GitHub reports **both #11 and #12 merged**; do not cherry-pick or merge them again.
- **Current Lovable project**: existing project `c9d12ae2-be6f-447b-b56a-0abb152936c7`, transferred to teammate workspace `6fc93288a88fe43e290e`. The GitHub merge may still need to synchronize into Lovable's editor; verify sync before any database draft/agent operations. Application was **unpublished** at last check.
- **Database**: production had `0011_planning_v3_private_rpc` in its applied journal. This early version **does not accept `save({preferences, expectedRevision})`** and therefore is **incompatible with the merged V3 server**. Subsequent **`0012_restrict_profile_reads_to_owner` is an unrelated profile migration**, already on main. DO NOT reuse `0012`; use the next conflict-free migration number determined from current Lovable journal.
- **Isolated Lovable draft(s)**: a later draft `drft_01m81ah426e10rxk7xmfcafd3e` ("V3 database for two-user test", `local_supabase`, thread `thr_f11h32mifb76`) existed with draft commit `f400226942d59b3a252e5483ed982fc043578283`, status `ready` at handoff. **Status ready is not test-pass proof.** Its base was an earlier main `c9b459a`; inspect any draft changes and rebase/recreate safely as needed, preserving newer main code, without writing production. Earlier draft `drft_01m817dkc0ewws2zd2n1ej7dc0` had no verified tests. Do not accept either draft until isolated acceptance and review.
- **Frontend**: full host and private-member V3 flows; day-by-day touch/keyboard busy grid; budgets, travel, lobby, cards, voting, reroll, final, .ics; old V2 fallback. Local synthetic V3 demo in `src/components/planning/v3/demo/` (NOT a real DB test). Claude reported 280 passed / 29 DB skipped before later integration; later 36 browser checks of synthetic demo at 375/768/1280, no external requests. These are *agent-reported*, not fresh post-merge tests.
- **Backend**: `src/lib/planning-v3/`, `src/lib/planning.functions.ts`, `src/lib/planning/service.server.ts`. Versioned V2/V3 RPC dispatch, Montreal overnight scheduling, budget/availability hard filters, weather, route adapters, fairness, privacy-safe projections. Codex previously reported 200 passed / 30 isolated DB tests skipped; not evidence of real SQL or live Routes.
- **Provider constraints**: V3 frozen rankings currently rely on a curated, date-bounded venue catalogue; coverage can expire or be too sparse, returning no-match. Google Places normalization is fixture-tested, but Google Places content is excluded from frozen V3 rankings pending provider-compliant storage/display design. Live Google Routes and a genuine two-browser flow have not been verified. Open-Meteo attribution and appropriate terms matter.
- **Repository rules**: read `AGENTS.md` and `docs/planning-v3/00_MASTER_SPEC.md` first. Only Lovable handles `drizzle/`, `supabase/migrations/`, and generated files. Do not rewrite published Git history, force-push, expose credentials or capability tokens, or bypass private-guest RPCs.

## 1. Immediate objective — REAL two-user pilot, not feature polish

Success: in an appropriately isolated, network-reachable test deployment, a host creates/configures a V3 party; guest joins by QR/link; both persist private answers; host can lock; **real server** produces an honest feasible Montreal plan from real validated venue/route evidence; both see same result; vote, reroll and finalize work; no-plan/reopen works; other participant cannot access private budget, availability, origin, accessibility/dietary requirements. Test on phone viewport. Nothing should be represented as real merely because synthetic fixtures work.

**Minimum prerequisites and release gates:**
1. **Restore/sync GitHub** after Lovable workspace transfer: current Lovable project must track new `main`; verify the sync did not replace the repository or change Supabase target.
2. **Agent A database contract correction**: in an independently fingerprint-verified isolated Lovable database, inspect existing drafts; implement necessary additive RPC correction under a *new* migration ID; preserve V2 and current `0012` profile work.
3. **Run REAL isolated SQL tests**: 17 synthetic cases plus capability security, caller-only privacy, service-only grants, stale revision, concurrency/lease, role removal, V2 regression, fully busy day validation, overnight Montreal date, precise location cleanup/readiness, cost/booking allowlist, and no leaks to Realtime/errors. Document actual pass/fail; do not count skips.
4. **Agent B integration**: from the new `main`, identify and fix only blockers, build and test; configure safe server-only Routes key and current evidence-based venue coverage for chosen pilot dates. A no-match caused by missing evidence is correct and must not be bypassed.
5. **Real two-session browser test**: accessible test URL + separately authenticated/capability-scoped users against an **isolated DB**, not fake in-memory demo; verify successful DB read-back and key privacy rules. Test realistic provider outages, mobile, no-match and reopen.
6. **Release decision**: only after gates and explicit separate human approval may someone accept a Lovable draft/apply a production correction, deploy or publish. Already-live `0011` should be examined for V2 regressions read-only immediately.

**What NOT to do:** restart the UI, re-merge #11/#12, spend time on extra visuals, invent venue fees/hours/routes, run tests on production, accept Lovable drafts automatically, or make secrets public. If Lovable credits or real credentials are unavailable, prepare code/SQL proposals and test plans but clearly mark blocked and stop before dangerous writes.

## 2. Known integration pitfalls / worklist

- SQL `party_plan` V3 `save` **must** accept `{preferences,expectedRevision}`, atomically compare under existing party row lock, reject stale requests; ensure V3 configure bootstraps from collecting V2.
- V3 service snapshot must equal `{schemaVersion:3,revision,config,members:[{id,preferences}]}` with caller/member security, leased snapshot, privacy-safe public projection. V3 lifecycle requests carry version; vote/host reroll/finalize carry current revision.
- Correct actual Montreal start date when candidate overnight spillover passes midnight; validate confirmed **busy all day** (valid), tonight depart-before-midnight policy, note length, accessibility/dietary tags. Pick one canonical set across UI/TS/SQL/curated sources.
- Verify frozen participant readiness stays consistent after location expiration/cleanup; removal/reroll/vote/lease behavior must preserve V2 semantics where required.
- Frontend now uses backend types and nested `plan.venue` metadata; verify actual SQL projection matches and never exposes private data. Venue `accessibilityVerified` is evidence of tags, **not automatically proof of each user's needs**.
- Correct old V2 dispatch when explicit `version:2`; check removal during legacy lease. Production already has partial `0011` and requires read-only V2 safety checks.
- Preserve `src/components/planning/v3/demo/` strictly as dev-only synthetic UI harness and never use it as acceptance for real DB/results.
- Check `.env` and runtime secrets for repo exposure; only publishable/browser keys in client code; actual service role and Routes keys belong server-side, must not be committed. The handoff must never include actual secret values.

## 3. Delegation — TWO Codex agents, separate responsibilities

**Agent A / Database owner**: Copy `docs/planning-v3/PROMPT_AGENT_A_DATABASE.md`. Work through Lovable MCP and authorized draft; **only this agent** causes Lovable-managed database changes. Its handoff is a verified correction/migration, SQL test evidence and exact API contract.

**Agent B / End-to-end integration owner**: Copy `docs/planning-v3/PROMPT_AGENT_B_INTEGRATION.md`. Work in a separate git branch (or worktree) from latest `main`; own application/test integration, evidence-backed pilot, build, and browser journey. Do not modify DB-managed files; coordinate live SQL gates with Agent A.

**Sequencing:** launch both concurrently. B may work on app/provider preparation while A fixes SQL, but B must wait for A's safe isolated DB endpoint and test credentials before claiming real end-to-end success. Neither should merge/publish/deploy without approval.

## 4. Acceptance evidence to return to the human

- Target workspace/project, draft ID, isolated vs production fingerprint comparison (redacted), exact **new** migration ID, generated types status, signed/recorded SQL test outcomes and failed/skipped counts.
- Integration branch commit SHA, unit/type/build results, live provider coverage and error-handling notes, reachable isolated test URL.
- Two separate browser session recordings/logs or deterministic walk-through evidence with host/guest different capability tokens (never disclose tokens); real persisted reads and no private leakage.
- GO/NO-GO table: draft acceptance, production migration, merging code fix PR, publishing site are **independent decisions**. No implied authorization from this handoff.

### Reference paths
`AGENTS.md`, `docs/planning-v3/00_MASTER_SPEC.md`, `docs/planning-v3/04_INTEGRATION_AND_QA_PROMPT.md`, `docs/backend-v3-lovable-handoff.md`, `docs/backend-v3-progress.md`, `src/lib/planning-v3/`, `src/components/planning/v3/`, `src/components/planning/v3/demo/`.
