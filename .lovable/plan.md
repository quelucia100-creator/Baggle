# Production release preflight (read-only findings)

No changes were made. Facts below.

## Recovery points
- Lovable Cloud provides one automatic daily database backup, retained roughly 14 days. Point-in-time recovery is not available.
- Usable pre-release recovery point: NOT VERIFIED. No read-only tool exposes the backup list, so no UTC timestamp or recovery ID can be reported. Provider recovery IDs are not surfaced to users.
- On-demand backup creation: no supported tool or button exists.
- Scope: database schema and data only. Storage files, secrets, sign-in settings and function code are not covered.

## Minimum human action
1. Open More -> Database -> Manage -> Backups; read the newest row's UTC timestamp and confirm it predates the release.
2. Optional current-state copy: More -> Database -> Manage -> Settings -> Export project data -> Export data -> Database -> Export -> Start export (one per 24h; backend must be running). This is a copy, not a restore point.

## Restore path
More -> Database -> Manage -> Backups -> Restore to this backup -> confirm. Restores this project in place, permanent, a few minutes of downtime, loses all later data and reverts schema.

## Draft drft_01m81rmny1fgzv4ynnp7mn5gz6 ("Host-first 0030 corrected SQL staging")
- Uses its own isolated test database; currently behind main.
- No supported database-only path applies its migration to live without accepting the draft. Accepting applies its schema to live and merges code.
- Alternative supported path: add the exact SQL as a new migration in the main project and apply via Lovable's migration tool (requires approval in a later turn). This changes the main project's files, so it would alter the GitHub tree before PR #20; Lovable may also apply all pending migrations together.
- Commit e6cc90e was not inspected in this turn.
