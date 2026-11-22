# Baggle two-agent working protocol

This repo uses two **independent** coding/planning conversations, with GitHub acting as shared persistent memory. No claim is made that chats or coding agents communicate automatically.

## Agent roles

- **Agent A / Product + State:** current owner's ChatGPT chat. Design decisions, secure session state, RPCs, vote/accept/recovery logic, integration planning. Follow [issue #5](https://github.com/quelucia100-creator/baggel/issues/5).
- **Agent B / Matching + Discovery:** Person B's separate assistant (ChatGPT, Claude Code or Codex). Pure flavour/feasibility solver, Places/fallback/weather, variety, tests. Follow [issue #6](https://github.com/quelucia100-creator/baggel/issues/6).
- **Shared coordination:** [hub #4](https://github.com/quelucia100-creator/baggel/issues/4). Its newest comments win for progress/decisions, subject to the explicit source-of-truth hierarchy below.

## Truth hierarchy

1. Actually deployed behavior / current verified code and tests (when known).
2. Latest merged `main` code and `AGENTS.md` (especially Lovable ownership restrictions).
3. Explicit approved new contract decisions recorded on hub #4 (and then docs via PR).
4. `docs/BAGGLE-V3-BASE.md` accepted product BASE.
5. Earlier v2 reference documents, background only.

If these conflict, don't silently invent a resolution. Post a contract question to the hub, ask the human, and preserve the existing working behavior until resolved.

## Startup checklist (every separate chat or coding session)

1. Inspect current `main` commit, open relevant PRs and worktree/branch status.
2. Read `AGENTS.md`, `docs/BAGGLE-V3-BASE.md`, hub #4 including latest comments, and your role issue.
3. Summarize deltas from last known state, note contract blockers, state files you intend to touch.
4. Work in a fresh short-lived branch; never force-push/commit directly to main.
5. Report status/verification in hub #4 when a decision, implementation milestone, blocker or PR happens.

## Lock interfaces before coding

Agree on one TypeScript boundary:
```ts
type BagglePlanningSnapshot = {
  config: /* date, duration, area, mode */;
  members: Array</* id, private constraints, two public flavours */>;
};

type BaggleRecommendationResult = {
  options: Array</* privacy-safe plan/time card with evidence */>;
  reason: /* safe no-plan reason or null */;
  source: /* live / fallback / mixed */;
};
```
These are conceptual shapes, not final compile-ready code. Agent A owns shared types and orchestration. Agent B owns an independently callable pure matching function. Do not both edit `src/lib/planning/types.ts` or `src/lib/planning/service.server.ts` concurrently.

## Safe file boundaries

Agent A: `src/lib/planning.functions.ts`, `src/lib/planning/service.server.ts`, security tests, approved non-generated state/type files. Database changes via Lovable **only**.
Agent B: `src/lib/planning/solver.ts`, `src/lib/planning/venues.ts`, `src/lib/planning/forecast.server.ts`, new matcher/provider helpers, their unit tests.
Frontend person: UI routes/components after the contract is frozen.

## Handoff comment format

Post comments on issue #4:
```
[AGENT A|AGENT B] [YYYY-MM-DD HH:MM ET]
STATUS: planned | implementing | blocked | PR open | ready
BASE: branch and SHA
DECISION / CHANGES:
FILES TOUCHED:
CONTRACT IMPACT:
TESTS ACTUALLY RUN:
BLOCKERS:
ACTION FOR OTHER AGENT:
ISSUE / PR LINKS:
```

A contract-changing proposal must be clearly labeled `PROPOSED` until acknowledged by both sides. The recipient explicitly replies `ACK` in hub #4 before building against it. Once approved, one party updates the contract via PR.

## PR and release rules

- Separate reviewable PRs for A and B. Rebase only with care and never rewrite published Lovable-synced history.
- No schema changes through hand-edited migrations; follow `AGENTS.md` and Lovable workflow.
- Both agents document actual tests. Integration owner runs full app/test/security checks after merging the pure matcher into orchestration.
- Don't send credentials or sensitive data in issue comments.
- Unattended sync is **not enabled**; read hub on each request or configure a separate explicit scheduled check.

## Starter text for Agent B's new conversation

> You're Baggle Agent B — Matching and Discovery. Connect to GitHub and read https://github.com/quelucia100-creator/baggel/issues/6 and hub https://github.com/quelucia100-creator/baggel/issues/4, including all recent comments. Read `AGENTS.md`, `docs/BAGGLE-V3-BASE.md`, `docs/AGENT-PROTOCOL.md` (on the reviewed docs branch until merged), inspect current main/PRs, and report what has changed. Coordinate `BagglePlanningSnapshot -> BaggleRecommendationResult` with Agent A through hub #4 before touching shared contracts. Your file ownership and detailed task are in issue #6. Use a separate feature branch and submit a PR with tests. Do not merge, modify Lovable-managed schema, leak private inputs, or silently alter requirements.

## Starter text for Agent A (this chat)

> Continue as Baggle Agent A, product architecture and group-state coordinator. Before giving code advice, inspect GitHub hub #4 and Agent B issue #6, plus latest `main`/PRs; summarize changes and decisions. Preserve the v3 product BASE, coordinate secure lifecycle and strict-majority feedback, and exchange handoffs in issue #4. Confirm contract proposals with B and don't independently edit B-owned solver or venue files.
