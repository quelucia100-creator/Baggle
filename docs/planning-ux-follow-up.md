# Planning UX scope and next contract

## Implemented in this frontend correction

- Caller-private, screen-local wizard: availability, explicitly selected budget, travel limit, optional rough area, review and confirmed save/update.
- Independent host setup: date/duration, synchronised label/coordinate meeting-area presets, real supported category, review and confirmed configure.
- Saved answers hydrate from the caller-only existing planning read. Unsaved Back/Edit drafts remain in screen-local state and are not placed in URLs, browser persistence, analytics or public roster.
- Real existing lock, vote, reroll, finalize and reopen transitions are retained.
- Planning-first party entry, local QR rendering of the current-origin join link, and precipitation probability display in percent.

## Not implemented: shared public flavour board

No pretend selection or client-only shared state was added. The existing API has no public flavours field or mutation.

A later authorised Lovable-managed backend change must:

1. Extend existing parties and capability-verified planning actions, not create another identity system.
2. Persist a member's public selection of **exactly two distinct** allowlisted flavours: Chill, Explore, Eat, Play, Sip, Surprise. Define whether members can change answers after baking starts.
3. Authorise reads/writes against active membership, revoke access after removal, validate the two-choice rule atomically and introduce revisions for concurrent changes.
4. Return only intentionally public flavour selections plus privacy-safe aggregated blend information. Never derive public messages or member identities from private budgets, time windows or origins.
5. Define an explicit flavour-to-supported-category/blend contract and how it is captured at lock. Do not pretend the current host category is a live blended choice.
6. Provide shared polling/realtime updates and tests for multiple members, reload, concurrent edits, removal, stale revision and unauthorised access.

## Not implemented: full Room → Bake → Reveal → Final Plan journey

The current collecting/locking/locked/final/no-plan states remain. A future experience needs agreed persistent phase transitions, public flavour readiness, host baking rules, recovery and a privacy-safe mapping to existing planning states before introducing the full named journey.

Group acceptance and blockers need capability-verified persistent per-member decisions, a defined acceptance threshold, stale-revision handling and carefully chosen public blocker information. Current finalization is still host confirmation, not unanimous group acceptance. Private constraint explanations or identifying outlier counts must remain forbidden.

True fairness improvements and richer venue variety require a separately scoped solver/catalogue/provider contract, verified hours/prices, weather policy decisions, ranking/coverage tests and compliant venue retention/attribution. This frontend change neither alters nor claims to complete that work.

## Verification boundary

Frontend tests use mocks and the browser check intercepts all app planning and party database requests. Rendered QR decoding verifies the exact join URL. No live database data was written and destructive database tests were excluded. Actual live saving was not retested because this task forbids live-data mutation.