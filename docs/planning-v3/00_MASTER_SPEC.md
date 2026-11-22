# COOKIE MONSTER / BAGGEL — PLANNING V3 FROZEN PRODUCT & ENGINE CONTRACT

Repository: `quelucia100-creator/baggel` (`main` is the source of truth). This contract replaces the planning UX/spec requirements for this feature, NOT existing auth, guest-party, map, or session architecture. First read `AGENTS.md`, `docs/FRONTEND-HANDOFF.md`, `docs/baggel-planning-contract.md`, `docs/planning-ux-follow-up.md`, and the existing code/tests. Never revive the original Django / other-Supabase-project model. One party supports up to 10 participants unless the existing authoritative limit is deliberately changed in a separate reviewed task. All host users submit their own private preferences like any other member.

## Governing invariants

- Existing `party_plan` capability-verified RPC, browser-held 64-character guest capability, server-function action pattern, lifecycle (`collecting → locking → locked | no_plan → final`, with host reopen), revisions, snapshot/lease, stored options, shared reroll vote limits and privacy-safe read projection remain authoritative. Extend; do not rebuild auth or invent independent `hangouts` identity.
- Lovable owns DB schema/migrations, `drizzle/`, and generated files. Neither Codex nor Claude manually writes those. Require authorized Lovable migration and regeneration. Never publish or modify live production data from local tests. Use an isolated test database for integration.
- Strong privacy: only requester may read her/his own preferences; host and other members only get `{id,submitted}`/roster names and deliberately public settings, never precise/rough origins, time blocks, budgets, allergies, accessible accommodations, inferred constraints, private scores, outlier identities/counts, or leakable compromise text. Use constant public compromise `Review this option` and neutral `no_match`. Revoke access on member removal. Tokens must not be stored in URL, logs, analytics, React Query keys, or public caches; no table-level read/grants/realtime on private planning data. Private data retention and deletion must be explicit.
- Deterministic eligibility and fairness; AI cannot waive hard limits, invent venue hours/prices/routes, or expose individual constraints. Provider/network failures cannot silently become verified results.
- Mobile-first touch + keyboard + screen-reader accessible; no fake controls, unsaved apparent success, nonfunctional navigation, fabricated results, or optimistic confirmations before server acknowledgment. Keep existing Baggle visual language, colors, typography and Lovable sync rules. Component UI should integrate with existing `src/routes/party.$code_.plan.tsx` and party QR/invite route.

## Canonical V3 type contract (camelCase in TS/API; Postgres names may differ)

`HostConfigV3`:
```
{
  version: 3,
  dateSelection: {
    mode: 'today_tonight' | 'future_dates' | 'best_day',
    selectionStyle: 'single' | 'multiple' | 'range' | null,
    candidateDates: string[], // sorted unique ISO calendar dates; materialized on server
    range: { startDate: string, endDate: string } | null
  },
  duration: { mode: 'fixed'|'flexible', minMinutes: number, maxMinutes: number },
  area: { mode: 'host_area'|'optimize_for_group', label: string|null,
          point: {lat:number,lng:number}|null, isStrict: boolean },
  travelArrangement: { mode: 'independent'|'together', sharedMeetingPoint: {lat:number,lng:number,label:string}|null,
                       sharedMode: 'walk'|'transit'|'drive'|'bike'|null },
  rules: { under18Friendly:boolean, freeOnly:boolean,
           alcoholPolicy:'allow'|'no_age_restricted'|'alcohol_free_only',
           requiredAccessibility: string[], dietaryHardRequirements: string[] }
}
```
Invariants: `today_tonight` materializes today in `America/Montreal` at the server; `future_dates` accepts exactly 1–14 unique chosen dates, from either specific picks or range; `best_day` REQUIRES a host-specified inclusive date range and server expands to dates. Range length maximum **14 calendar days**, date horizon today through +14 days (inclusive; decide inclusive off-by-one in tests). Reject past dates, nonexistent dates, duplicates after normalization, and mismatch of range/date list. For today mode, render from NOW and exclude elapsed slots. `area.point`/label mandatory for host_area; `isStrict` distinguishes fixed geographic boundary from area preference; optimize_for_group uses individual origins, not naïve midpoint. For shared travel, common meeting point and mode are required; member trip to meeting point still must be evaluated, or member explicitly confirms already at meeting point. For fixed duration min=max; allowed durations 30–240 minutes, multiples of 30. Flexible duration enumerates legal 30-min durations in min–max; don't quietly shorten below specified minimum.

`MemberPreferencesV3`:
```
{
  version: 3,
  vibes: ('chill_cozy'|'social_lively'|'adventurous'|'competitive'|'creative'|'surprise_me')[], // 1–2 distinct
  likedActivities: ('food_cafes'|'games'|'sports'|'outdoors'|'arts_culture'|'entertainment'|'nightlife'|'surprise')[],
  excludedActivities: ('food_cafes'|'games'|'sports'|'outdoors'|'arts_culture'|'entertainment'|'nightlife')[],
  budget: { currency:'CAD', preferredMinCad:number, preferredMaxCad:number,
            hardMaxCad:number|null, explicitlyUnlimited:boolean },
  availability: {
    mode:'tonight'|'calendar',
    tonight: { earliestDepartureAt:string|null, latestReturnAt:string|null,
               anytimeFromNow:boolean, noReturnDeadline:boolean }|null,
    days: { date:string, confirmed:boolean, busyIntervals:{startAt:string,endAt:string}[] }[]
  },
  origin: { source:'current_location'|'manual'|'group_area', label:string|null,
            lat:number|null,lng:number|null, accuracy:'approximate'|'precise_ephemeral' },
  travel: { mode:'walk'|'transit'|'drive'|'bike', maxOneWayMinutes:number,
            returnMode:'walk'|'transit'|'drive'|'bike'|null, alreadyAtSharedMeetingPoint:boolean },
  accessibilityHardRequirements:string[], dietaryHardRequirements:string[],
  optionalNote:string|null
}
```
Invariants: liked and excluded disjoint; exclusions hard, vibes/likes soft. Budget UI offers selectable presets `Free`, `Under $15`, `$15–30`, `$30–50`, `$50+` and dual bound/range controls; preset changes are reversible. `0 <= preferredMinCad <= preferredMaxCad <= 500` in $5 increments; hardMaxCad >= preferredMaxCad when set, or user explicitly chooses *no hard spending limit*. Never default an absent cap to unlimited; require explicit selection. Hard cap always enforced when present, including free-only override. Currency CAD; prices displayed as estimated costs only when sourced. Google price tiers are NOT reliable CAD amounts. A preferred minimum must NEVER reject cheaper venues.

Availability: TODAY/Tonight has one page containing departure/from and required-back-by controls, each with contextual `Anytime`/`No deadline` choice. `Anytime` means from now, not 00:00 past; `No deadline` means no member-imposed cutoff, but finite host/date/venue bounds still constrain search. If user selects explicit return 00:00–06:00, use next-day timestamp. Never conflate activity end time with member being home: include outbound and RETURN travel before latest return. Multi-day calendar presents one selected host candidate day at a time, 30-minute slots, full day plus clearly labelled overnight spillover; touch drag paints busy slots red, pointer/tap/keyboard toggles, erase mode, clear all, mark all busy, undo; converted to merged and sorted nonoverlapping UTC intervals. Unpainted is available ONLY after per-day confirmation. Don't silently mark unchecked days free. Reject zero feasible time and inconsistent intervals; support overnight, DST gaps/ambiguities with explicit policy (reject/ask correction, don't fabricate times). Availability is server-authoritative and private. Display day-by-day schedules with clear user-local timezone `America/Montreal` (project currently uses that).

Origin: two active choices, `Use my current location` (prompt browser permission ON CLICK only, HTTPS, handles denied/timeouts/unsupported, offers manual fallback) or `Choose location` (search/autocomplete/map pin/preset with actual selected label+point; no fake labels or arbitrary text with unknown coordinates). No location permission on initial render. Choose `use group area` only if host area exists and user explicitly chooses it; auto-optimization requires a meaningful origin. Current location coordinates are private; if precise, consent and short TTL/cleanup; never expose or log. Location selection may vary per date: allow optional per-day origin overrides if needed, or explicitly record the one origin applying to all chosen days. No location shared with others. `maxOneWayMinutes` integer 5–90, interpreted for chosen mode, and outbound + return must each be <= limit (plus latest-return check). `returnMode` optional defaults to outbound mode. Shared travel: members' own mode to/from meeting point plus common transport leg, transfer buffer, and back leg; compare door-to-door one-way limit, no fake independent routing.

Group rules: under18-friendly means verify venue access restrictions (not blanket ban on any restaurant that sells alcohol); `alcohol_free_only` is a separate harder restriction; required accessibility tags and allergies/dietary hard requirements are checked only against verified venue support. If evidence missing, mark incompatible, don't infer. Ask food/allergy questions conditionally when dining activities can be suggested; request only data needed, preserve privacy. Group rules override venue preference scoring. Member optional note may be interpreted for suggested tags, but no arbitrary free-text command becomes a hard solver condition without member confirmation.

## Venue, routing, weather, and output contracts

`VenueCandidateV3`: stable source (`curated`|`google_places`), place id or curated id; name, precise coordinate, category/activity tags, venue vibe tags, official/maps URL, source timestamp, source attribution, verified age/alcohol/accessibility/dietary flags, independently sourced per-person cost (`free` true or min/max price CAD + confidence + timestamp) OR unknown, verified opening intervals/special hours for the ACTUAL candidate date (regular hours alone are not guaranteed for holidays), season, indoor/outdoor, bookingRequired (yes/no/unknown), booking URL ONLY if verified, rating optional. Google `priceLevel` is an illustrative TIER, not a measured dollar ceiling. Unknown mandatory venue cost, hours, age/accessibility suitability or essential details must NOT produce a verified match. Don't guarantee a reservation or seating simply from hours. Respect Google Places licensing, retention, attribution, and API field masks; don't copy/indefinitely persist unauthorized provider data. Use curated offline fallback with self-sourced fields and expiration.

Travel provider: server-only keyed Google Routes when configured (DRIVE/WALK/TRANSIT route matrix, with relevant future departure/return times); for BIKE, implement an actual supported cycling `computeRoutes` path or equivalent verified provider because REST `computeRouteMatrix` does not support bicycle. Use exact mode; departure and post-activity return route are separate and may differ, especially after midnight. Bound API cost: geographical prefilter, top-K candidates, grouped/batched provider calls respecting documented matrix limits; timeout, rate limit, quotas, and testable adapter for failures. When provider unavailable, may use an **explicitly labeled estimated** mode-specific fallback, but **may not** claim accurate verified travel or promise hard travel compliance on pure haversine; conservative policy: don't finalize under a strict hard travel limit unless source confidence is sufficient. No map provider keys in browser/server-to-client payload. Server may offer member-private directions for each member; shared plan has venue address, meeting time, cost estimate/unknown label, verified hours or caveat, booking required status, maps link, accessibility confidence, weather, and nonprivate generic reasons. Never return individualized route origins or private constraint details in shared response.

Weather: if rules require outdoor unsafe-weather exclusion, drop outdoor options on rain, snow, below -5°C or above 32°C (cover every overlapping forecast hour). Weather unavailable cannot be presented as confirmed safe: either exclude unverified outdoor options from the 'verified match' tier or clearly enter non-guaranteed recovery flow. Winter/summer season must be valid on event date. Use forecast time horizon properly; do not claim weather for a day beyond provider horizon.

Solver searches each candidate date, valid duration(s), 30-minute start slots, all active submitted members, feasible candidate venues and travel modes. For each member and proposed slot ensure: departure >= earliest, travel arrival <= start, uninterrupted availability including travel and stay, end+RETURN travel <= latest return (if any), each one-way travel <= personal max, cap >= verified estimated total personal cost (or explicitlyUnlimited), activity not excluded, verified requirements all met, venue open continuously for full visit. Shared travel includes meeting point legs. Rank feasible candidates by MAX-MIN member preference satisfaction then mean satisfaction, travel fairness (avoid burdening one member), variety, weather, provider confidence, rating, deterministic tie-break. Host cannot override private hard constraints. Freeze top validated options and metadata at lock for rerolls; vote threshold, revision checks, host rerolls, no-plan and finalization remain transactional. All read/write actions capability verified. `no_match` generic; recovery offers expanding dates/area, reducing duration and privately revising requirements, never exposing who prevented match.

Public result must be actionable: ONE venue + ONE date/time + duration + address + Google Maps link + transparent CAD estimate (not promise) + booking label/link only if real + condition/availability warnings + generic 'works for group' claims only if actually verified + vote/reroll/finalize + shareable .ics (client-generated, no calendar write). No invented reservation times, costs, or routes. Reopen changes invalidate stale snapshot/options and force fresh validation.

## Definition of done / test matrix

- All 3 date modes; future single/multiple/range; best-day range; date horizon and 14-day bound; host choice stored and read back; host included as participant; 2–10 guest roles; locks restricted to >=2 actually submitted.
- Vibes/likes/exclusions; bounds+presets+true hard maximum; free-only and strict accessibility/age/allergy constraints; location permission user-gesture/denial; origin manual selection; all 4 travel modes; round trips/late transit; shared travel meeting coordination; daily overrides if supported; no loss of drafts.
- Tonight selector and IDC semantics; each calendar day confirmed; drag/click/touch/keyboard painting red blocks; undo; blackout complement normalization; 30-min granularity; midnight, Montreal DST both transitions, partial boundaries, no-overlap.
- Venue candidate verification and provider failure; Google Places attribution/retention; dynamic route provider quotas and bike exception; outdoor weather threshold + unavailable forecast; season; accurate open-through-slot hours; transparent uncertain booking/cost/hours; unbiased fairness and deterministic stable stored rerolls.
- Database access: members cannot read/write other members' private answers even as host, no private data in Realtime/shared options/URL/analytics/query keys/errors, removal revocation, double lock race, stale lease/revisions, reroll limits and historical plan invalidation; live isolated DB tests.
- Browser happy-path on TWO independent sessions: create→QR join→host+guest answer→lock→one result→vote→reroll→final; no-plan→reopen→resubmit. Mobile manual tests at 375px width, desktop, slow network, denied geolocation, provider outage. `npm test`, `npm run build`, `npx tsc --noEmit`, changed-file lint + format/check, `git diff --check`; report inherited failures separately. Do not claim tests or live database checks pass if they were skipped, mocked, or lacked credentials.