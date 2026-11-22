# Planning V3 frontend integration

Review of [frontend PR #11](https://github.com/quelucia100-creator/baggel/pull/11) at `c24d900` for [backend PR #12](https://github.com/quelucia100-creator/baggel/pull/12). The frontend worktree and its in-progress changes stayed under Claude's ownership.

## Authoritative imports

Use `@/lib/planning-v3/contract` for `PlanningCommandV3`, `PlanningRequestV3`, `HostConfigV3`, `MemberPreferencesV3`, `PlanningStateV3`, `VersionedPlanningState`, `PublicPlanV3`, and `PlanningWarningV3`. The same entry point exposes the runtime schemas, `canBootstrapPlanningV3(state, isHost)`, `planningWarningsV3`, and `planningWeatherAttribution`. Use `updatePartyPlanningV3` from `@/lib/planning.functions` with the existing TanStack `useServerFn` and guest capability. The V2 call retains its existing types and behavior.

## Lifecycle

| Browser request                | Capability RPC                                                                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V3 read                        | `read` with `{}`. This may return V2.                                                                                                                                                                           |
| V3 configure                   | `configure` with canonical host config tagged `version: 3`. The host can activate V3 while V2 is collecting. Acknowledgment returns V3.                                                                         |
| V3 save                        | Send `preferences` and the `revision` the form was based on. The server checks a capability-verified read and sends `{ preferences, expectedRevision }`. The database checks it again under the party row lock. |
| V3 lock                        | `begin_lock` with `{ schemaVersion: 3 }`. The host must be ready and at least two active members, including the host, must be ready.                                                                            |
| V3 vote, host reroll, finalize | `{ schemaVersion: 3, revision }`. Use the revision of the displayed option.                                                                                                                                     |
| V3 reopen                      | `reopen` with `{ schemaVersion: 3 }`. Re-read before offering another lock.                                                                                                                                     |

Supply `schemaVersion: 3` for every browser V3 request. Keep legacy mutations on the V2 call, including reopening a legacy no-plan result. Legacy locked and final plans stay on the legacy path. Show V3 member save and lock only after V3 configuration is acknowledged. Refresh and reconcile a stale private draft before resubmitting; do not silently retry it against a new host revision.

## PR #11 findings

1. The host setup gates `canSave` on an already-V3 state. Allow initial V3 configure for a collecting V2 host via `canBootstrapPlanningV3`. Use the V3 alias for polling so the same query can see the state before and after configure. Keep V2 guests and V2 locked/final actions on their legacy flow.
2. Finalize omits the displayed revision. Send it for finalize, and send the form's revision for member save. Gate the lock button on host readiness as well as two ready members.
3. Result rendering uses temporary `PublicOptionV3Extras` with top-level cost and booking. Use `PublicPlanV3`. Read `plan.venue.cost` (nullable verified CAD range), `bookingRequired`, `bookingUrl`, `attribution` (array), and `accessibilityVerified` under `venue`. Render a booking link only when supplied. Explain `cost: null` as unknown. Use `plan.weather` as a nullable slot summary with the exported attribution. Map warning codes to user-facing copy. Display `plan.date` as the actual Montreal date of `startAt`, even for a following-day start. The plan timestamps are UTC ISO strings.

## Database acceptance gate

Review against `0011` and the coordinated follow-up contract found three blockers in `0011`: direct save body without expected revision, rejection of actual dates during overnight spillover, and completed precise-location cleanup making frozen participants look unsubmitted to the vote controls. The database owner is handling these items and cross-version guards. The backend maintains the agreed revision-bound and actual-date contracts. The replacement isolated database draft and acceptance results are pending. Keep PR #12 in draft through isolated SQL and two-session browser verification.
