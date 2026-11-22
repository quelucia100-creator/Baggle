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
- Route loading and root BagelTransitionProvider share BagelLoadingScreen; suppress the route loader during guest/auth navigation so only one rotating bagel appears until navigation settles.
- Guest and authentication form screens use validated route search state so browser Back restores the preceding screen rather than an unrelated older party.
- Guest lobby Back and party logos return to guest entry; confirmed create/join responses and the visible verified party header restore a session-only name/code reference, never replacing membership credentials or letting background polling overwrite it.
- Automatic journey and post-authentication transitions replace history entries; sign-out cancels queries and clears cached data before replacing the current screen with sign-in to avoid stale-screen loops.
- Signup display names live in `public.profiles`, created by an auth trigger from `display_name` metadata.
- Guest parties use a security-definer RPC with hashed, random membership capabilities; direct table access is denied and host permissions plus the member limit are checked atomically in the database.
- Party screens use a top navigation header rather than the split authentication shell so the roster has room to grow.
- Journey start is shared, but each member's team/map view is persisted independently through the capability-verified RPC so navigation cannot move other members or grant host controls.
- Google Maps loads only after hydration; weather runs through a membership-verified server function with a private shared cache, never browser provider requests.
- Planning extends existing parties through capability-verified RPCs; private preferences/snapshots have no client table grants or realtime publication so neither hosts nor guests can read others' limits.
- Planning locks snapshot submissions under the existing party row lock and finish through service-only lease RPCs; this prevents duplicate computation and stale completion without changing guest identity or map navigation.
- Planning ranking is pure TypeScript with Montreal civil-time conversion in one helper; server functions orchestrate forecasts and persist only privacy-safe results so rerolls never recompute or expose individual costs.
- Shared plan options are allowlist-projected in SQL (`party_plan_public_option`) on read and completion with constant compromise text and a single neutral no-plan reason, because the guest RPC is directly callable and any variation can reveal private limits.
- Account preferences use owner-only database access, case-insensitive unique usernames, and separate protected step URLs; persist partial answers and gate account home until setup is complete, without changing guest capability flows.
- Account availability stores owner-only recurring ISO weekdays in account_weekly_availability; BusyGrid recurring mode uses fixed civil clock labels without dates or past-slot exclusions. Preserve deprecated dated answers without auto-conversion and keep weekly saves separate from party submissions so private edits never silently change a shared plan.
- Group weekly openings are computed only by a membership-verified database RPC returning confirmed all-member intersections, never individual schedules; pokes recheck openings and serialize on the group row to prevent stale or duplicate notifications.
- Guest planning UI lives in the independent party plan route with hydration-gated, capability-verified polling and a screen-lifetime private query cache; this keeps account auth and each member's map navigation independent.
- Planning wizards keep unsaved drafts only in screen-local state, retain saved answers from caller-only RPC responses, and await confirmed mutations before readiness; this prevents premature success and keeps role/validation states testable without database writes.
- Meeting-area and rough-origin preset mappings live in a frontend-only module and preserve unknown saved coordinate pairs unless explicitly replaced; this avoids technical coordinate entry without changing the backend contract.
- Event-generation Routes and both Places adapters use the linked Google Maps connector gateway with server-only credentials and Worker-compatible redirects, so workspace reconnections actually reach the providers.
- Keep host-first multi-day planning behind the optional capability-verified days RPC, falling back only for its explicit missing-function response to the separate single-day wizard; use the same readiness classification in lobby/map/invite controls, treating read failures as unknown even with cached data, so failures cannot unlock invitations. Regenerate database types from the installed schema so pending migrations never break working journeys.
- Dashboard code joining uses the account username with the existing capability-verified party join and navigates only after confirmation; this preserves guest membership and avoids a separate room-authentication flow.
- Plan maps use only capability-visible device locations and the selected public venue, never private planning origins; optional route requests reverify membership and the plan, cap concurrency and cache briefly to bound provider usage.
- Export and register the canonical planning server-function builder directly alongside typed aliases; keeping its stable name makes endpoint discovery independent of alias analysis and preserves open-client function IDs.
- Invitation entry polls only after confirmed membership and never follows stored map-view flags; the retired map URL redirects to plan results to keep old links usable without navigation loops.
- Party social RPCs bind auth users to capability-verified memberships, never display names; serialized leave/disband operations invalidate leases. Dashboard schedules project only into screen-private drafts and save through existing planning validation.
