<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Auth/welcome screens wrap content in `AuthShell` (src/components/BagelScene.tsx) so the split banner/bagel layout stays consistent.
- Guest and authentication form screens use validated route search state so browser Back restores the preceding screen rather than an unrelated older party.
- Automatic journey and post-authentication transitions replace history entries; sign-out cancels queries and clears cached data before replacing the current screen with sign-in to avoid stale-screen loops.
- Signup display names live in `public.profiles`, created by an auth trigger from `display_name` metadata.
- Guest parties use a security-definer RPC with hashed, random membership capabilities; direct table access is denied and host permissions plus the member limit are checked atomically in the database.
- Party screens use a top navigation header rather than the split authentication shell so the roster has room to grow.
- Journey start is shared, but each member's team/map view is persisted independently through the capability-verified RPC so navigation cannot move other members or grant host controls.
- Google Maps loads only after hydration; weather runs through a membership-verified server function with a private shared cache, never browser provider requests.
- Planning extends existing parties through capability-verified RPCs; private preferences/snapshots have no client table grants or realtime publication so neither hosts nor guests can read others' limits.
- Planning locks snapshot submissions under the existing party row lock and finish through service-only lease RPCs; this prevents duplicate computation and stale completion without changing guest identity or map navigation.
- Planning ranking is pure TypeScript with Montreal civil-time conversion in one helper; server functions orchestrate forecasts and persist only privacy-safe results so rerolls never recompute or expose individual costs.
- Account preferences use owner-only database access, case-insensitive unique usernames, and separate protected step URLs; persist partial answers and gate account home until setup is complete, without changing guest capability flows.


## Baggle v3 shared agent workflow

The accepted product BASE and current code gaps are documented in `docs/BAGGLE-V3-BASE.md`.
The two-agent working rules are in `docs/AGENT-PROTOCOL.md`. Always read the newest comments on [GitHub Agent Hub #4](https://github.com/quelucia100-creator/baggel/issues/4) and your assigned Agent A [#5](https://github.com/quelucia100-creator/baggel/issues/5) or Agent B [#6](https://github.com/quelucia100-creator/baggel/issues/6) issue before changing shared contracts.

- Agent A owns group-state, privacy, RPC/session lifecycle and orchestration. Agent B owns pure flavour matching, venue discovery, and their tests.
- The existing `docs/baggel-planning-contract.md` describes the implemented v2 foundation; the original `docs/hangout-flow-v2-reference.md` is a historical reference from a different architecture.
- Propose and mutually acknowledge a `BagglePlanningSnapshot -> BaggleRecommendationResult` contract before parallel work; do not concurrently edit `src/lib/planning/types.ts` or `src/lib/planning/service.server.ts`.
- Keep all Lovable-owned schema and generated file restrictions above intact. No commits directly to main. Report actual test results and PR links in Hub #4.
