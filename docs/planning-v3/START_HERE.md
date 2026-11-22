# START HERE — Run Codex + Claude Code simultaneously

**This is the actual project:** `https://github.com/quelucia100-creator/baggel`. `main` may receive Lovable commits while agents work. **PR #10 was already merged**. These are preparation notes; check live HEAD before beginning because Lovable can write new commits.

## Step 1. Pull the docs already committed to MAIN

All six implementation-kit files are committed under `docs/planning-v3/`. No manual copying or additional document commit is needed.

In Windows PowerShell inside the existing Baggel repo:

```powershell
git switch main
git pull --ff-only origin main
```

Canonical V3 requirements: `docs/planning-v3/00_MASTER_SPEC.md`. The earlier `docs/planning-v3-contract.md` is preserved as an existing copy. Do not alter `.env`, secrets, working code, or teammates' branches. If your worktree is dirty, resolve it without resetting or losing changes.

## Step 2. Create TWO isolated working directories

```powershell
git fetch origin
git worktree add -b feat/planning-v3-engine ..\baggel-codex origin/main
git worktree add -b feat/planning-v3-ui ..\baggel-claude origin/main
```

If branches already exist, fetch and use existing branches/worktrees rather than recreating with `-b`. Worktree separation prevents the two coding agents overwriting working files. Each needs dependencies installed in its own folder (`npm install --no-package-lock`, or use the repo's Bun lockfile with a compatible installed Bun); do not check in a new `package-lock.json` by accident.

## Step 3. Launch BOTH concurrently

**Codex:** Open the `..\baggel-codex` folder in one IDE/terminal, paste the ENTIRE `docs/planning-v3/01_CODEX_BACKEND_PROMPT.md` as the agent instruction, with `docs/planning-v3/00_MASTER_SPEC.md` present.

**Claude Code:** Open `..\baggel-claude` in a separate IDE/terminal, paste the ENTIRE `docs/planning-v3/02_CLAUDE_FRONTEND_PROMPT.md`, with the exact same `docs/planning-v3-contract.md`.

Both must code, test, commit and open independent PRs. Do not tell either one to operate on main. They can develop immediately; the frontend must not fake persistence until backend exists.

## Step 4. Lovable owns schema & RPC

In your EXISTING Lovable editor (the Baggel project, not a new project), paste `docs/planning-v3/03_LOVABLE_DATABASE_PROMPT.md`, and provide the same `docs/planning-v3/00_MASTER_SPEC.md`. Request safe isolated/staging-first migrations and generated types; DON'T let it independently rewrite the frontend/backend. Lovable changes can sync to `main`, so two development branches must `git fetch` and `git merge origin/main` before integration. Check actual staging/prod environment before approving schema changes.

## Step 5. Integration

Do not immediately merge two PRs. Use `docs/planning-v3/04_INTEGRATION_AND_QA_PROMPT.md` as the final gate. Expected order: Lovable additive schema/RPCs + generated types first; Codex backend second; Claude frontend third; isolated DB + two-browser E2E fourth. Confirm all V3 fields actually round-trip through UI → API → DB → private read → solver → public plan. Never deploy on green mocks alone.

## What to share back for review

PR links for both agents, Lovable migration/version or schema change report, each agent's final test run summaries and blockers. We can then review conflict risk and merge readiness before production.