# Planning V3 backend review

Implementation branch: `feat/planning-v3-engine`. Baseline: `808277f` on Baggel main, including PR #10. [Draft backend PR #12](https://github.com/quelucia100-creator/baggel/pull/12).

## Implemented

- Strict V3 host and private member payloads. Server-materialized Montreal dates, explicit budget and availability choices, merged UTC blackout intervals, and one origin for all selected dates.
- Today or overnight scheduling from the lock clock, calendar windows and all legal half-hour starts and durations in the candidate dates. Montreal's ambiguous and nonexistent wall-time endpoints require correction. Valid absolute intervals can span a DST transition.
- Hard requirements for schedule, both travel directions, cap, activity vetoes, age and alcohol, accessibility, diet, date-specific hours, season, and outdoor weather. A strict host area is a 3 km radius. The wider geographic prefilter is 35 km from each routing origin.
- Mode-specific Google Routes adapter with time-specific traffic and transit, separate return checks, bike endpoint, request-local memoization, and shared travel with five minutes per transfer. Stops publishing feasible results for any candidate with unknown required route or venue evidence.
- Versioned service dispatch through the existing capability RPC, a revision-bound save and lock snapshot, safe public projections and neutral recovery suggestions. V2 stays explicitly versioned. Existing V2 rankings retain legacy semantics and require a new V3 lock.
- Venue cards include the actual Montreal event date, UTC timestamps, duration, address, attribution, CAD cost evidence or an unknown warning, booking metadata, route verification and a forecast summary when available.

## Ranking and provider budgets

Each member score is `(2*vibeMatch + 2*activityMatch + budgetFit)/5`. Each match is 0 or 1. Surprise opts into all choices for that field, and an empty likes list is neutral. Budget fit is 1 inside the preferred range, decreases by the CAD distance outside that range divided by 500 and floors at 0. Unknown price scores 0.5 after hard filtering. Compare descending minimum then descending mean score. Next minimize worst one-way travel as a fraction of each member's cap, then the spread of those fractions. For successive alternatives, prefer the smallest `2*sameVenueCount + samePrimaryActivityCount`, then closer preferred area, better forecast coverage and lower precipitation, curated source, rating, and stable venue and time order. Freeze up to 20 verified options. Internal scores and trips are erased from the projection.

The engine prefilters venues and considers at most 12. It interleaves candidate dates inside preference bands when querying Routes. Each job is bounded to eight concurrent requests, 96 requests, 480 billed route elements/individual calls, and a 15-second adapter deadline. Transit requires both a matrix route and a timed itinerary with transit stops. Set server key quotas in Google Cloud for aggregate usage. Weather uses one request for up to 12 venue locations. The free Open-Meteo endpoint is for non-commercial use; the UI needs to credit its CC BY 4.0 forecast data and indicate that the result is summarized. [Google Routes matrix](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRouteMatrix) · [Open-Meteo terms](https://open-meteo.com/en/terms)

## Dependencies and remaining verification

| Master spec area                                                                 | Status                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dates, availability, budget, preferences, hard rules and fairness                | Implemented and covered by automated local tests.                                                                                                                                                                                          |
| Walk, drive, bike, timed transit and shared round trips                          | Implemented and covered using provider fixtures. No live key in this environment.                                                                                                                                                          |
| Weather coverage, known closures and sourced V3 venue facts                      | Implemented and covered using fixtures. The curated catalogue contains dated municipal examples and expires unless it is refreshed.                                                                                                        |
| Google Places                                                                    | Request-scoped adapter and dated-hours normalization are tested. The frozen ranking accepts independently curated metadata only. Google content persistence needs a licensed storage or ID-only hydration design and frontend attribution. |
| Capability authorization, private storage, removal, revision and lease lifecycle | Server integration and isolated SQL acceptance tests are implemented. The V3 migration and SQL projections are owned by Lovable. The database owner confirmed the draft's database is isolated; migration/acceptance results are pending.  |
| End-to-end browser and provider validation                                       | Pending the frontend branch, compatible isolated V3 RPC, and a server-only Routes key.                                                                                                                                                     |

Sources for the dated examples: [Parc La Fontaine](https://montreal.ca/en/places/parc-la-fontaine) · [Parc Jarry](https://montreal.ca/en/places/parc-jarry) · [Bibliothèque du Boisé](https://montreal.ca/en/places/bibliotheque-du-boise) · [November 24 book club](https://montreal.ca/en/events/book-club-119752).

Run `npm test`, `npm run build`, `npx --offline --package=typescript -- tsc --noEmit`, changed-file ESLint and Prettier, and `git diff --check`. The isolated SQL suites are opt-in and must use the existing isolated-database preflight and authorized test credentials. [Lovable handoff](./backend-v3-lovable-handoff.md)

## Local verification

- `npm test` passed, 194 tests passed, 29 isolated Supabase tests skipped, zero failures.
- `npm run build` passed. Vite reports the pre-existing weather server-function validator deprecation and an unresolved paper-texture asset reference.
- TypeScript, changed-file ESLint, changed-file Prettier, and `git diff --check` passed. The plain `npx tsc --noEmit` invocation tried to fetch the unrelated `tsc` package under the Bun-installed lockfile; selecting the installed TypeScript package explicitly passed.
- Isolated V3 SQL and real provider checks were not run here. No production data was accessed by the tests.

## PR #11 and RPC integration review

PR #12 incorporates database owner's `0011` and generated types by merging `origin/main`. The backend continues to require the coordinated follow-up SQL contract. Lovable's first draft was accepted externally and the database owner confirmed live catalog version `0011`. The replacement isolated draft, compatible follow-up, and acceptance tests remain pending. The author-owned backend diff stays in planning code, backend tests, and backend docs.

V3 saves now carry the user's displayed form revision through preflight and SQL CAS. The public option decoder canonicalizes SQL timestamps and warning ordering, keeps venue evidence nested, and validates the actual local date and whole overnight interval. The authoritative UI imports and compatibility findings are in [the frontend review](./backend-v3-frontend-review.md).

Integration verification: `npm test` passed with 200 passing tests, zero failures, and 30 opt-in isolated database tests skipped (4 V3). Build, TypeScript, ESLint, Prettier, and diff checks passed. SQL-shaped response and lifecycle tests use fixtures. The two-browser flow was not exercised.
