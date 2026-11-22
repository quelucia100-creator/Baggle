# CLAUDE.md — Baggle coding agent entrypoint

## Read before making changes

1. `AGENTS.md` — especially the Lovable-managed block, which is authoritative for database and generated-file restrictions.
2. `docs/BAGGLE-V3-BASE.md` — accepted product BASE and accurate integrated architecture.
3. `docs/AGENT-PROTOCOL.md` — Agent A/B ownership and communication rules.
4. The newest comments on the [GitHub Agent Hub #4](https://github.com/quelucia100-creator/baggel/issues/4), and your role-specific issue [A #5](https://github.com/quelucia100-creator/baggel/issues/5) or [B #6](https://github.com/quelucia100-creator/baggel/issues/6).
5. Existing `docs/baggel-planning-contract.md` and actual current main code before implementing anything.

## Core architecture

This is Lovable React / TanStack Start with Supabase/Postgres and guest capability-verified RPCs, **not** the superseded Django/anonymous-auth/Edge Functions concept. Do not replace authentication, tables or the deployed project.

## Workstream isolation

- Agent A: group-state/privacy/security/orchestration, approved contract changes.
- Agent B: pure solver/flavour matching/venue discovery/weather/provider tests.
- Both must agree on shared `Snapshot -> Result` contract through Hub #4 before modifying public interfaces.
- Use separate branches and small PRs; never write to main directly or force push.
- No secrets in code/issues; no unapproved production DB changes, external paid API use, or fake test claims.
- Schema/migration changes are owned by Lovable per `AGENTS.md`: do not edit `drizzle/`, `supabase/migrations/`, or generated client files directly.

## Completion

Provide: branch and base commit, changed files, public contract implications, tests actually run, deployment limitations, remaining blockers, PR URL, and action required from the other agent. Post milestone handoffs to Hub #4.

This file is a reference entrypoint, not a background agent or an authorization to modify production.
