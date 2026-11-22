# Codex Agent A — Finish V3 Lovable database safely (copy everything below)

You are the SOLE DATABASE/RPC OWNER for the existing Baggel / Cookie Monster V3 project.
Repo: quelucia100-creator/baggel
Project ID: c9d12ae2-be6f-447b-b56a-0abb152936c7
New Lovable workspace: 6fc93288a88fe43e290e
Objective: ONLY the minimum corrections and REAL isolated SQL acceptance needed for a two-user live pilot.

READ IN FULL FIRST: AGENTS.md; docs/planning-v3/LIVE_TEST_HANDOFF.md; docs/planning-v3/00_MASTER_SPEC.md; docs/backend-v3-lovable-handoff.md; docs/planning-v3/04_INTEGRATION_AND_QA_PROMPT.md. Inspect actual current main, Lovable drafts, migrated schema/RPCs and generated types. Don't rely on older messages as current DB truth.

GitHub PRs #11 and #12 are ALREADY MERGED via #11. Never merge them again. Main also includes the unrelated 0012_restrict_profile_reads_to_owner. DO NOT use or overwrite migration number 0012. Choose the next correct available ID from the *current* Lovable journal after refreshing.

Existing Lovable draft 'V3 database for two-user test' (drft_01m81ah426e10rxk7xmfcafd3e, local_supabase) may contain recent work on an older main base. Inspect its contents, test status, credit status and relation to latest main; preserve substantive work, but do not blindly accept/rebase it or overwrite newer code. If a new draft is needed, first verify it has an independent database with host and instance/database fingerprint mismatch against production; a draft can fall back to production. No writes until verified. Compare production read-only and check V2 safety.

Implement USING LOVABLE-MANAGED changes ONLY:
- Correct existing party_plan RPC save to {preferences, expectedRevision}, row-lock atomic revision check and stale rejection.
- Collecting V2 -> V3 host configure bootstrap and strict schema dispatch; preserve V2 with explicit version 2.
- Service-only V3 snapshot exactly {schemaVersion:3,revision,config,members:[{id,preferences}]}, active lease and membership rules.
- Preserve final/reroll/vote revision protection, nested allowlisted plan.venue cost/booking/source fields, constant neutral public compromise/no_match, accurate Montreal start date overnight.
- Confirm fully busy days as valid, tonight departure requirements and note/tag vocabularies consistent with merged TypeScript contract, precise location expiry/readiness, and V2 removal/lease compatibility.
- Secure caller-only private member answers, no direct browser table grants, no private Realtime/public leakage, service-only snapshot/complete, membership revocation.
- Scheduled cleanup when relevant; avoid unnecessary architecture expansion.

RUN REAL isolated SQL tests: 17 existing synthetic cases plus critical V2 regressions, capability privacy, expectedRevision stale saves, lease/double locks, removal, busy days, midnight result date, data cleanup. Record actual PASS/FAIL/SKIP and troubleshoot failures. Don't present mocked fixtures as SQL acceptance.

Return a concise handoff to Agent B: isolated DB connection/environment strategy (never share raw secrets), exactly deployed draft migration IDs, RPC input/output contract and generated types, how to run integration tests, any remaining constraints.

DO NOT: accept draft, deploy, publish, merge unrelated commits, change production DB, modify manually drizzle/supabase migrations or generated files, or expose service-role credentials. Every consequential production operation needs a separate explicit user approval. If Lovable credits, permissions or isolation fail, STOP and report blocker without repeated costly retries.

Do the work now; do not merely write a plan. Commit only authorized Lovable-managed changes to their correct draft and report evidence.
