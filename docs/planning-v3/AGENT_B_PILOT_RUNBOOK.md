# Cookie Monster V3 two-person pilot

**Status on 2026-11-22: NO-GO for an online test.** Application checks passed. The isolated database acceptance, live Google Routes checks, and two-browser acceptance are pending. GitHub `main` was `12bf4a5`. PRs #11 and #12 were already merged. Lovable editor synchronization to that commit remains unverified.

## Application and database boundary

| Check | Application evidence | Isolated database evidence still needed |
| --- | --- | --- |
| V2 read, V3 opt-in and V3 save | V3 reads accept legacy V2. Host configure bootstraps a collecting party. Save sends `{ preferences, expectedRevision }`. Full-day busy intervals are sent intact when at least one other confirmed window fits. | `0011` expects bare preferences and rejects a fully busy day. Verify Agent A's replacement contract, stale saves, unchanged V2 behavior and removal during a lease. |
| Notes, tags and ceilings | V3 validates a single-line note up to 280 characters, lowercase tag identifiers and CAD caps in $5 increments up to $500. The UI and curated evidence use the same selectable accessibility tags. | Confirm the isolated SQL uses compatible validation and preserves caller-only read-back. |
| Lock, read and overnight | The service loads the versioned, leased snapshot and projects nested public venue metadata. The solver emits the actual Montreal start date after midnight. | `0011` requires the result date to appear in the host date list, which can reject a genuine spillover. Verify the corrected SQL projection and frozen readiness after precise-origin cleanup. |
| Vote, reroll, finalize and reopen | Vote, reroll and finalize send the displayed revision. Roster readiness comes from the server. No-match is neutral. | Verify active participant authorization, service-only lease/grants, removed-member revocation, stale revisions, no private responses or Realtime, and matching public results in both sessions. |

No migration, generated file, Lovable draft, hosting configuration, or production record changed on this branch. The dev-only demo remains a synthetic harness.

## Venue and provider coverage

- The walking pilot uses **Les filles de l’air at L’Entrepôt**, 2901 Boulevard Saint-Joseph, Lachine. The City lists free walk-in admission, a general audience and exhibit-specific hours. The catalogue covers Nov 27 and Dec 4, 18:00–21:00, and Nov 28–29 and Dec 5–6, 12:00–17:00, Montreal time. The venue lists accessible parking. Other accessibility details, dietary support and alcohol-free status are unverified for matching. [Exhibition](https://montreal.ca/evenements/les-filles-de-lair-marie-blanche-rossi-109178) · [Venue](https://montreal.ca/lieux/lentrepot-maison-de-la-culture-de-lachine)
- The **Lachine** origin preset is a rough reference based on Bibliothèque Saul-Bellow. A lookup must check actual outbound and return legs from the stored rounded point. Use walking for the pilot. Route checks cover travel time, while the displayed CAD estimate is for admission. Transit fares, parking and tolls are outside this estimate. [Saul-Bellow Library](https://montreal.ca/en/places/bibliotheque-saul-bellow)
- The existing Nov 24 book-club entry is a single 90-minute slot and requires registration. It cannot exercise rerolls by itself. No overnight venue is evidenced for this pilot. Confirm current schedules before use and refresh the catalogue after Dec 6. [Book club listing](https://montreal.ca/en/events/book-club-119752)
- Google Routes uses matrix requests for walking, driving and transit, plus Compute Routes for cycling and scheduled transit checks. Missing evidence excludes the candidate. The app keeps provider route responses and individual trip data out of the frozen plan. Before external access, confirm the project's Google terms and public Terms of Use/Privacy Policy coverage. Keep Google Places out of frozen V3 results. [Routes policy](https://developers.google.com/maps/documentation/routes/policies) · [Places policy](https://developers.google.com/maps/documentation/places/web-service/policies)
- A direct Open-Meteo forecast request for the Lachine venue returned 72 hourly records for Nov 27–29 UTC on Nov 22. Outdoor matching requires a complete safe forecast. The free endpoint is for non-commercial use. [Open-Meteo terms](https://open-meteo.com/en/terms)

## Local and isolated acceptance commands

From the integration branch in PowerShell with Node 24:

```powershell
npm install --no-package-lock --no-audit --no-fund
npm test
npm run build
npx --no-install tsc --noEmit
npm run lint
git diff --check
```

Before enabling the following database suites, obtain Agent A's draft ID, redacted isolation fingerprint comparison, current migration and generated-type status, corrected RPC contract, and SQL pass/fail/skip totals. Inject the verified isolated `PLANNING_TEST_SUPABASE_URL`, `PLANNING_TEST_SUPABASE_PUBLISHABLE_KEY`, and `PLANNING_TEST_SUPABASE_SERVICE_ROLE_KEY` into a fresh test shell via the secret manager. The Vitest suite rejects the configured app's endpoint and credentials. Leave the app's environment pointing outside the isolated target in this test shell so its guard can distinguish the two.

```powershell
$env:PLANNING_DB_TESTS = '1'
npm test -- src/test/planning-v3-db.test.ts src/lib/planning/security.test.ts src/lib/party.test.ts
Remove-Item Env:PLANNING_DB_TESTS
```

Agent A's wire suite is loopback-only. Use the corrected suite from Agent A, with the verified isolated loopback `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the process environment. The copy on base `main` assumes the old save shape.

```powershell
$env:PLANNING_V3_DB_TESTS = '1'
npm exec --yes --package bun -- bun --no-env-file test db/tests/planning_v3_rpc.test.ts
Remove-Item Env:PLANNING_V3_DB_TESTS
```

Inject an API-restricted, billed pilot `GOOGLE_ROUTES_API_KEY` into the test process to exercise four real outbound and return route pairs using public coordinates. Run this from the same egress environment as the eventual preview if the key is IP-restricted.

```powershell
$env:PLANNING_LIVE_ROUTES_TESTS = '1'
npm test -- src/test/planning-v3-live-routes.test.ts
Remove-Item Env:PLANNING_LIVE_ROUTES_TESTS
```

## Open the isolated preview

1. Confirm Agent A's isolated target and record its fingerprint before making any party. In a separate app shell or the approved preview's secret manager, set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the isolated database. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the same isolated browser-accessible origin and publishable key at build time. The tracked `.env` has app defaults, so supply all four explicitly. Inject `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_ROUTES_API_KEY` at runtime only. Leave the optional Google Places key unset.
2. For a local rehearsal, build a Node server, then start it on loopback. Run the preview behind an approved private HTTPS ingress for a remote guest. Use the same HTTPS origin in both profiles so the QR points to that preview. If network reachability requires a deployment or publish action, collect explicit approval before proceeding.

   ```powershell
   $env:NITRO_PRESET = 'node-server'
   npm run build
   $env:HOST = '127.0.0.1'
   $env:PORT = '4173'
   node .output/server/index.mjs
   ```

3. Before creating a party, verify the client build uses the isolated endpoint and contains no privileged key. Confirm the server targets the same isolated instance. Never log tokens, private answers, raw DB responses, credentials, or provider payloads. Use only test names and public landmark coordinates.

## Two-browser acceptance

1. Open the preview in two browsers or profiles with separate storage. The host selects **Jump in as a guest**, enters a test name, selects **Create a new group**, and opens the event planner. The guest joins from the team QR or its link. Confirm the invite uses the HTTPS preview origin and contains only the party code.
2. Host switches to the new planner. Choose Nov 28 and 29 (or Dec 5 and 6), a fixed 60-minute visit, free admission, independent travel and a Lachine area preference. On both profiles use Walking, the Lachine rough origin, a 45-minute limit and a free spending ceiling. Like arts and culture. In one profile, mark the first day busy all day and confirm the second as free all day. In the other, confirm both days. Give each profile distinct private test notes. Include 375px mobile with geolocation denied, then repeat verification at 768px and desktop.
3. Save both sets of answers, reload each profile and reopen its own form. Confirm exact owner-only read-back, the expected shared roster readiness, and no leakage of the other profile's note, availability, budget, requirements or origin in reads or shared plans. Use the isolated suites for direct RPC denial, service-only operations and revocation evidence. Keep private network payloads out of recordings.
4. Host locks. Expect an open L’Entrepôt exhibition slot with free admission and an independent walk check in both directions. Compare venue, timestamps, revision and option index between browsers. With two participants the existing threshold permits one vote to advance. Have the guest vote, the host reroll, then the host finalize. Verify the guest sees the same final plan after reload and check the calendar export.
5. In a fresh party, configure only overnight availability and confirm no-match with current evidence. Verify only the host can reopen, both see the collecting state, and widening dates or availability allows another save and lock. Repeat a party with the Routes key unset in the isolated app runtime and verify neutral no-match instead of an estimated route being accepted. Inspect Agent A's isolated acceptance result for a valid after-midnight persisted start, since this pilot has no supported overnight venue. Record the actual status of each scenario separately.

## Observed results and decisions

| Gate | Result |
| --- | --- |
| GitHub integration | Existing V3 PRs merged before this branch. No conflicts or Lovable-owned file edits. |
| Automated application checks | 298 passed, 0 failed. These include mocked providers/RPCs and UI harnesses. Build, type check, changed-file ESLint and Prettier passed. The client build excluded privileged-key sentinels and the server Routes endpoint. The Node preview served the welcome, guest entry and planning routes on loopback with an unused placeholder database endpoint. |
| Whole-repo lint | Fails on `main` and the pilot branch, primarily from the Windows CRLF checkout and inherited formatting and lint findings. |
| Isolated database | 30 Vitest cases skipped. The Bun wire suite skipped 17 cases and two hooks. No verified isolated database was available. |
| Live providers | Open-Meteo responded. Four Google Routes probes skipped pending the pilot key. Venue facts verified from municipal sources. |
| Two-browser acceptance | Pending isolated credentials, real walking route evidence and approved HTTPS access. No test URL available. |
| Draft acceptance, production migration, integration merge, publish | Separate decisions pending evidence and explicit approval. |
