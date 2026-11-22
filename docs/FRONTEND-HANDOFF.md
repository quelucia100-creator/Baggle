# Baggel planning frontend handoff

Use `accessParty("create", "", name)` to create a guest party or `accessParty("join", code, name)` to join. Both are exported from `src/lib/party.ts`. Use the returned party code and the same browser’s `membershipToken()` for every planning call. Read the token in the browser, where the existing guest flow stores it.

```ts
import { useServerFn } from "@tanstack/react-start";
import { membershipToken } from "@/lib/party";
import { updatePartyPlanning } from "@/lib/planning.functions";

// Inside the component, after the browser has joined the party.
const planning = useServerFn(updatePartyPlanning);
const state = await planning({ data: { action: "read", code, token: membershipToken() } });
```

Every action is a POST and takes `action`, a six-character uppercase alphanumeric `code`, and a 64-character hexadecimal `token`. TanStack Start registers the function at build time. The server verifies the guest capability through Supabase for each action.

| Action | Who can call | Additional input and behavior |
| --- | --- | --- |
| `read` | Active member | Returns the latest state. The first read initializes planning for the party. |
| `configure` | Host | `config` with `date` in Montreal `YYYY-MM-DD` from today through 14 days ahead, `durationMin` from 30 to 240, `areaLabel` (1–80 characters), `area: { lat, lng }`, and `category` (`park`, `cafe`, `museum`, `restaurant`, or `activity`). Available while collecting. |
| `save` | Active member | `preferences` with integer `budget` from 0 to 4, `freeFrom` and `freeTo` in local `HH:mm`, integer `maxTravelMin` from 5 to 90, and optional `originLat` and `originLng` as a pair. Use null or omit both to use the meeting area. An end time at or before the start time rolls into the next day. Available while collecting. |
| `lock` | Host | Requires at least two active submissions. Acquires a lease and ranks once. A concurrent caller may receive `locking`. |
| `vote` | Active member included in the lock | Pass the latest `revision`. Duplicate votes for the same revision count once. At the threshold, advance to the next stored option. |
| `host_reroll` | Host | Pass the latest `revision`. Advances through the saved options, even after the shared three-reroll allowance is used. |
| `finalize` | Host | Finalizes the current locked option. Repeating it returns the final state. |
| `reopen` | Host | Moves a `no_plan` result back to `collecting` with submissions retained. |

`PlanningState` and `PublicPlanOption` are exported from [the planning schemas](../src/lib/planning/types.ts). Every action returns the status, config, revision, readiness (`members: { id, submitted }[]`), caller-only `selfPreferences`, current `plan`, `planIndex`, `optionCount`, `groupRerollsUsed`, `votes`, `voteThreshold`, `selfVoted`, `venueSource`, and `noPlanReason`. A plan has venue details, UTC ISO timestamps, `hoursUnknown`, optional weather represented as a nullable field, and the fixed message “Review this option”. Format displayed times in the Montreal timezone. `venueSource` is `google_places`, `fallback`, or null.

- **Collecting.** Show readiness. Keep `selfPreferences` in the caller’s own form and use the existing party roster to determine host controls.
- **Locking.** Show progress and poll `read`. After 30 seconds the host can retry `lock` to recover an expired lease.
- **Locked.** Use the latest server state after each mutation. A stale-revision error calls for a fresh `read`. Rerolls use the stored ranking. Disable rerolls at the last option and group voting after three shared rerolls.
- **No plan.** Expect `plan: null` and `noPlanReason: "no_match"`. Offer the host a reopen action and use generic text. The catalogue may yield no match when a category lacks a verified tier or schedule.
- **Final or error.** Show the selected final plan. On a failed or interrupted mutation, re-read state before retrying and keep edits in the caller’s form. Handle rejected requests with user-facing messages.

Keep the capability token out of URLs, logs, analytics, and shared client caches. Private preferences and rough origins belong only in the caller’s own form. Scores, outlier identities or counts, leases, snapshots, and other members’ preferences are internal.

### Environment and rollout

- Server settings are `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The existing browser guest client uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `GOOGLE_PLACES_API_KEY` is optional and server-only. Open-Meteo currently requires no key. Use a local or isolated Supabase instance with Lovable migrations through `0010` for end-to-end checks.
- Before production rollout, run the isolated database suites and verify live-role behavior. Lovable must address any active rankings created under the earlier soft-constraint solver before those plans can be treated as meeting hard limits. The privacy migrations sanitize historical results, but the stored plans lack the facts needed to revalidate travel and hours.
- Leave production Places credentials unset until the retention design and results attribution are resolved. The current ranking stores venue metadata and rerolls reuse it. Google limits retention of its venue data and requires attribution when displaying it. [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies) · [Service terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)
