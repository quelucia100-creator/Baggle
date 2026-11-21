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
