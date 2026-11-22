# Codex Agent B — Real V3 live pilot integration (copy everything below)

You own the app integration and real two-browser acceptance for Baggel / Cookie Monster V3. You DO NOT own SQL migrations.
Repo: quelucia100-creator/baggel
Lovable project: c9d12ae2-be6f-447b-b56a-0abb152936c7
Objective: shortest SAFE path to a real online pilot for two participants, with actual persisted data and honest venue/time.

READ IN FULL FIRST: AGENTS.md; docs/planning-v3/LIVE_TEST_HANDOFF.md; docs/planning-v3/00_MASTER_SPEC.md; docs/planning-v3/04_INTEGRATION_AND_QA_PROMPT.md; docs/backend-v3-lovable-handoff.md; current code/routes. Fetch latest origin/main. Frontend PR #11 and backend PR #12 were ALREADY MERGED into main; don't cherry-pick them. Check if a newer Lovable Git sync commit has appeared. Work on a fresh branch feat/planning-v3-live-pilot in a separate worktree; never rewrite history.

COORDINATE WITH Agent A, who alone uses Lovable to fix the isolated database. You can prepare code/tests meanwhile; do not claim real end-to-end completion until Agent A provides verified isolated V3 RPC acceptance and authorized test environment.

Your tasks, IN ORDER:
1. Review merged React V3 screens and server/functions types; fix only blocking compile/runtime/contract errors. Preserve the working V2 planner, guest capability security and dev-only synthetic demo until real acceptance passes.
2. Resolve exactly the UI/backend/schema mismatches still extant: revision-bound V3 save and finalize, V2->V3 bootstrap/read, fully busy day, overnight start date, note/tag agreement, accessibility evidence labeling, privacy-safe nested venue cost/booking metadata, locked/final readiness.
3. Confirm live routing key and service-role connection are server-only in the test environment (NEVER show or commit secrets). Check Google Routes modes and return trips with honest missing-provider behavior. Ensure realistic, current-date Montreal curated options with sourced opening hours, CAD costs, accessibility/age/diet evidence where required. Be explicit if coverage is limited; no invented facts, fees, routes or fake success. Google Places frozen content must follow usage/storage attribution terms; don't casually turn on unsupported storage.
4. Build and test from latest main: npm test, npm run build, npx tsc --noEmit (or installed tsc), lint and git diff --check. Separate all mocked tests, isolated DB tests, and real provider tests in reporting.
5. Once Agent A provides a verified isolated database, securely configure the app against it (no production writes). Arrange a network-reachable **isolated test** URL using an approved preview/staging path; do not publish/production-deploy without approval. If a public URL requires a publish action, STOP and request exact permission first.
6. Real TWO-browser flow: host creates party; host opts into V3; second independent guest joins QR/code; both independently save/read back private preferences; lock; one evidence-based venue/start time or justified no-match; vote; reroll; finalize; verify both see same public plan; check private data is never exposed to other guest/host, direct unauthorized RPC is rejected, and no-plan/reopen. Exercise 375px mobile and 768px and desktop, denied location, route/provider failure, and an overnight case. Record steps and actual pass/fail.
7. Update docs with exact test/deployment commands and brief GO/NO-GO report. Commit and push on your branch; provide PR. Do not merge to main or deploy to production until user approval.

Do not rebuild the frontend, add nonessential features, broaden venue scope, or use the fake local demo as proof of integration. Keep all fixes focused on working pilot. If test credentials or providers are missing, identify precise blocker and prepare reproducible tests rather than guessing.

Begin immediately with safe repo work and coordinate Agent A's database handoff.
