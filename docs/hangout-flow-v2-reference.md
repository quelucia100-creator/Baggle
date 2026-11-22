> **REFERENCE ONLY — NOT A DEPLOYABLE MIGRATION FOR BAGGEL.** Copied from `SeriousParkyPark/cookie-monster` at commit `1f3a19f` for the integration review. This spec was written against a *different* Supabase project and identity model. Follow [INTEGRATION.md](../INTEGRATION.md) and Lovable's `AGENTS.md` before altering runtime code or data. In particular, do not paste the old SQL migrations into this Lovable-managed project. The spec's §11 amendments were proposals, except the free-tier change already made in the original schema.

---

# Hangout Flow v2 — Spec (Lovable + Supabase)

Status: agreed in the interview on 2026-11-21. Budget: about 12 working hours, 4 people.
Supersedes the architecture in `PLAN.md`. The product idea is the same: a host shows a QR code, friends join with a name, everyone privately sends their limits, and the group gets one plan.

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Frontend | **Lovable** (React). Lovable builds and hosts it. |
| Backend | **Supabase only**: Postgres, RLS, Realtime, Edge Functions (TypeScript/Deno). The team agreed to drop Django. |
| Existing Django repo | Stays in place and unused. The new backend lives in `supabase/` in this repo. `AGENTS.md` and `CLAUDE.md` already point agents at this spec. |
| Hosting | Everything runs in the cloud: the Lovable app and the Supabase project. No laptop, tunnel, or school-Wi-Fi dependency. |
| Identity | Name only. Each phone calls Supabase `signInAnonymously()`, so `auth.uid()` is the member token, kept in localStorage. Google sign-in is optional and post-core. |
| Live updates | Supabase Realtime on privacy-safe tables. |
| Venues | **Live Google Places API (New)** called **at lock time**. Results are upserted into a seeded Montreal pool, which is also the fallback. |
| Travel | Straight-line estimate (haversine × city speed). The host sets the meeting area. Members can optionally share a location, rounded to about 1 km, never shown, and deleted after the event. |
| Weather | **Open-Meteo** (free, no key). Outdoor venues get a score penalty in bad weather. Seasonal venues are excluded out of season. |
| Opening hours | Hours are per weekday. A venue with no listed hours is allowed, and its card says "check hours". |
| Categories | Members vote. Only the top 1–2 categories are queried and ranked. Votes do **not** enter the fairness score. |
| Reroll | The group votes to reroll, using a **shared pool of 3** rerolls. After those are used, the **host can reroll without limit** until the ranked list runs out. |
| Lock | Only the host locks ("Find our plan"), and only once at least 2 members have submitted. Group size is capped at 12. |
| Lock UX | Every phone shows a reveal animation ("cooking up your plan…"). The fetch runs once, and rerolls walk down the stored ranking. |
| Privacy | Members never see each other's limits. **The host can see the names** of members who don't fit. Everyone else sees counts only. |
| Save plan | `.ics` download and a Google Maps link. No calendar writes. |

### Scope tiers

- **Core (must demo):** QR join → submit limits → host locks → live Places + weather → ranked plan → reroll → final.
- **Stretch, in this order:** (1) category voting, (2) countdown page + `.ics`.
- **v3 (designed for, not built):** multi-day ranges, the adjust-or-be-excluded flow, Google Calendar pre-fill, web push reminders. See §9. The schema leaves room for these, so adding them later should not need a rewrite.

Note: category voting changes the Places query. If voting is cut, the host picks one category at creation, and that category feeds the same `categories` input.

---

## 1. Data model (Supabase Postgres, `supabase/migrations/`)

All times are `timestamptz`. The app timezone is **America/Montreal**, and every conversion from wall-clock time happens in one helper (`tz.ts`).

### `hangouts`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| code | text(6) unique | URL code, uppercase, no ambiguous chars (no 0/O/1/I) |
| host_uid | uuid | `auth.uid()` of the creator |
| title | text(80) | optional |
| date | date | core: defaults to today. Range is v3 |
| duration_min | int | default 90, allowed 30–240 |
| area_label | text | e.g. "Downtown / McGill" |
| area_lat, area_lng | numeric(9,6) | meeting area. Search centre and default travel origin |
| default_category | text | used when nobody votes |
| status | text | `collecting` → `locking` → `locked` → `final` (also `no_plan`) |
| locked_at | timestamptz null | |
| plan_index | int default 0 | index into `plan_options` |
| group_rerolls_used | int default 0 | maximum 3 |
| venue_source | text null | `live` or `fallback`. For debugging and demo honesty |

### `members` (private: a member reads only their own row; the host reads names and status, never prefs)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| hangout_id | fk | |
| uid | uuid | `auth.uid()`. One member per uid per hangout |
| name | text(30) | unique per hangout, case-insensitive: `unique (hangout_id, lower(name))` |
| budget | int 1–4 null | |
| free_from, free_to | time null | wall-clock time on `hangouts.date`. If `free_to <= free_from`, the window **crosses midnight** (e.g. 21:00–01:00) |
| max_travel_min | int null | allowed 5–90 |
| lat, lng | numeric(9,2) null | optional, **rounded to 2 decimals** before insert (enforced by a check constraint/trigger). Set to null by the cleanup job after the event |
| categories | text[] | stretch: voted categories |
| submitted_at | timestamptz null | |

### `member_status` (public within a hangout; this is the Realtime source)
`hangout_id, member_id, name, has_submitted`. A trigger on `members` keeps it in sync. It exists because Realtime cannot stream from views, and the private table must not be subscribable.

### `venues` (shared pool and cache)
`id, place_id unique, name, category, types text[], price_tier 1–4 null, lat, lng, hours jsonb null (per weekday open/close periods), is_outdoor bool, season text null ('winter'|'summer'|null), maps_url, rating, source ('seed'|'live'), fetched_at`.

### `plan_options` (written once by the lock function, readable by members after lock)
`hangout_id, rank, venue_id, start_at, end_at, score, compromise text, weather jsonb (temp, precip_prob, code, summary), hours_unknown bool`.
The plan is **stored**, not recomputed: live Places results are not deterministic, so recomputing could give a different answer.

### `reroll_votes`
`hangout_id, member_id, plan_index`, unique on all three. Votes only count for the current `plan_index`.

---

## 2. Security (RLS)

- Anonymous sign-in must be **enabled** in the Supabase project, with a CAPTCHA or rate limit turned on for judges' devices.
- `hangouts`: anyone signed in can `select` by code (the code is the invite). Only Edge Functions write to it (service role), except `insert` on create, where `host_uid = auth.uid()`.
- `members`: a member can `insert` or `update` only their own row (`uid = auth.uid()`), and only while the hangout is `collecting`. A member can `select` only their own row. **The host gets no select on `members`.** The host reads names through `member_status` and outlier names through the lock function's response (§4).
- `member_status`, `plan_options`, `reroll_votes`: `select` is allowed if the caller has a member row in that hangout or is its host.
- Edge Functions verify the caller's JWT and check host or member status themselves.
- Secrets: `GOOGLE_PLACES_API_KEY` is stored only in Edge Function secrets. The Lovable app gets only the Supabase URL and the anon key.
- **Privacy test (required):** with 2 anonymous users in one hangout, user B's `select` on `members` returns only B's row, and a Realtime payload on `member_status` contains no prefs.

---

## 3. Screens (Lovable)

All screens use the route `/h/:code/...`. Each screen calls `signInAnonymously()` if there is no session yet.

1. **Create** `/new`: title, duration, meeting area (preset neighbourhood list plus "use my location"), and a default category. On submit, show the host screen.
2. **Host** `/h/:code/host`: a large QR code (rendered client-side, e.g. with `qrcode.react`), the code and URL as text, a live member list (name and ✓) from Realtime, and **"Find our plan"**, which stays disabled until at least 2 members have submitted.
3. **Join** `/h/:code`: a name field. If this uid already has a member row, skip straight to Submit. If the name is taken, show "That name is taken". Because identity is the uid, not a name, there is no claim picker. The fallback for a lost localStorage (in-app browsers) is to join again with a slightly different name. This is an accepted risk.
4. **Submit** `/h/:code/me`: budget ($–$$$$), free from and to (the hint "ends after midnight? that's fine"), max travel, an optional "share my rough location", and category checkboxes (stretch). The form stays editable until lock.
5. **Waiting**: the member sees "N of M ready, waiting for the host…". When Realtime shows `status = locking`, every phone plays the reveal animation.
6. **Plan** `/h/:code/plan`: venue card with name, category, $ tier, time, a weather chip, the compromise text, "check hours" if needed, and a Maps link.
   - Members see **"Reroll?"**, which shows votes in the form "2/3 want a reroll", while the shared rerolls last. After that, the button reads "Only the host can reroll now".
   - The host sees Reroll (unlimited once the shared pool is used up) and **"Let's go"**.
   - When the list is exhausted, the card says "Last option".
7. **No plan**: everyone sees "No time works for everyone". **The host also sees the names** of the members whose windows don't overlap, so they can sort it out directly. Members can still edit their times only if the host reopens the hangout. In core, the host's "Reopen" button sets the status back to `collecting`.
8. **Final / Countdown** `/h/:code/go` (stretch 2): a live countdown, the venue card, the forecast for the slot, the names of who's coming, an `.ics` download (generated client-side), and the Maps link. The core fallback is the plan card with "It's decided" as the end state.

---

## 4. Edge Functions (`supabase/functions/`)

| Function | Caller | Behaviour |
|---|---|---|
| `lock-hangout` | host | Checks host and `collecting` and at least 2 submitted. Sets `locking` with a conditional update (`where status='collecting'`), so a double press cannot run it twice. Gathers prefs, fetches venues and weather, ranks, writes `plan_options`, then sets `locked` (or `no_plan`) and `locked_at`. Returns `{status, outliers?: [names]}`. The host-only outlier names are returned only here. If any step throws, it rolls back to `collecting`. |
| `vote-reroll` | member | Inserts a vote for the current `plan_index`. When votes ≥ **ceil(submitted/2)** and `group_rerolls_used < 3`, it advances `plan_index`, increments `group_rerolls_used`, and clears the votes, all in one transaction. |
| `host-reroll` | host | Advances `plan_index` when a next option exists. There is no cap. |
| `finalize` | host | `locked → final`. |
| `reopen` | host | `no_plan → collecting`. |
| `cleanup` (scheduled, pg_cron) | — | Clears `members.lat/lng` once an event has ended. |

The vote threshold (a majority of submitted members) is my default, since the interview didn't decide it. Change it if the team wants something different.

### Lock pipeline (`lock-hangout`)
1. **Categories:** stretch: the top 2 by vote count (ties are kept up to 3). Otherwise `default_category`.
2. **Search circle:** centred on the host area. Radius = clamp(min(max_travel_min) / 4 min-per-km, 1 km, 8 km).
3. **Places (New) Nearby Search:** one call per category, `maxResultCount: 20`, with the field mask `places.id,places.displayName,places.location,places.priceLevel,places.regularOpeningHours,places.types,places.googleMapsUri,places.rating`. The field mask keeps the call on a cheaper billing SKU. Timeout is **4 s per call**, run in parallel.
4. **Upsert** the results into `venues` (`source='live'`). If a call fails or times out, query `venues` by category and distance instead, and set `venue_source='fallback'`. Users see no error.
5. **Weather:** one Open-Meteo request for the area, with hourly `temperature_2m, precipitation_probability, weather_code` for the date. If it fails, set the weather penalty to 0 and show the chip as "forecast unavailable".
6. **Rank** with `solver.ts` (§5), then write the top 20 as `plan_options`.

Keep the total lock time under about 6 s. The reveal animation hides it.

---

## 5. Solver (`supabase/functions/_shared/solver.ts`, pure, no I/O, unit-tested with Deno)

Inputs: members' prefs, venues, date, duration, weather by hour, and today's month.

- **Overlap:** take each window, turn it into absolute timestamps on `date` (a window that crosses midnight runs into the next day), and intersect them. If the overlap is empty, the result is `no_plan`, and the solver reports the outliers. An outlier is a member whose removal would make the overlap non-empty. The fallback is to report everyone whose window doesn't intersect the largest pairwise overlap.
- **Candidate starts:** on :00 and :30 inside the overlap, with start + duration ≤ the overlap end.
- **Hours:** the venue must be open for the whole slot on that weekday, and closing times past midnight are handled. If the hours are unknown, the candidate is allowed with `hours_unknown = true`.
- **Season:** drop venues where `season='winter'` from May to October, and `season='summer'` from November to April. Season and `is_outdoor` come from Places types plus a small hand-made type map (e.g. `park`, `ice_skating_rink`, `beach`, `hiking_area` are outdoor).
- **Member cost** = the largest of these overages, each clamped to [0,1]:
  - budget: `(tier − budget)/3`. If the tier is unknown, this term is 0.
  - travel: `(t − max)/max`, where `t = haversine_km(origin, venue) × 4 + 5` min. The origin is the member's location if shared, otherwise the host area.
  - time: 0 by construction, since candidates lie inside the overlap. Kept for v3.
- **Weather penalty** (outdoor venues only), applied to that slot's hours: precipitation probability ≥ 50% or rain/snow codes → 0.5. Temperature < −10 °C or > 32 °C → 0.4. Take the larger, otherwise 0.
- **Score** = `min_i(1 − cost_i) × (1 − weather_penalty)`. Ties break by mean(1 − cost), then earliest start, then highest rating, then place_id.
- **Compromise text** is built from counts only: "Works for everyone" / "Stretches the budget for 1 person" / "Outdoor — 40% chance of rain" / "Indoor pick: snow expected". The text never contains names.

Tests: an empty overlap gives `no_plan` with the right outlier, a window crossing midnight, a venue closing at 02:00, unknown hours flagged, a winter venue dropped in July, rain penalising a park so a café wins, the tiebreak order, and the budget and travel normalisation.

---

## 6. Workstreams (12 h)

The contract comes first. **In hour 0–1, B pushes the schema and C pushes the TypeScript types** (`_shared/types.ts`) and function request/response shapes. Everyone builds against those.

| Dev | Owns | Delivers |
|---|---|---|
| **A: UI** | Lovable app | All screens in §3. Realtime subscriptions, reveal animation, QR. Starts on mock data and switches to Supabase once B lands. |
| **B: DB + RLS** | `supabase/migrations/`, seed | Schema, RLS policies, the `member_status` trigger, Realtime publication, privacy test, `seed.sql` with a demo hangout `DEMO42` (4 submitted members). |
| **C: Lock + solver** | `functions/lock-hangout`, `vote-reroll`, `host-reroll`, `finalize`, `reopen`, `_shared/solver.ts` | Solver with Deno tests (TDD), lock pipeline orchestration, double-lock guard. |
| **D: Venues + weather + release** | `_shared/places.ts`, `_shared/weather.ts`, seed venue script, deploy | Places client with field mask and timeout, Open-Meteo client, a pre-demo script that seeds ~60 Montreal venues (McGill/downtown, all categories), env and secrets, demo script, backup recording. |

Checkpoints: **H1** contract frozen · **H4** join → submit → lock working end to end on fallback venues · **H7** live Places + weather in, rerolls done · **H9** stretch items · **H10** feature freeze, full demo run on 3 real phones over cellular · **H11–12** fixes and record the backup video.

---

## 7. Cut order (first cut → last)

1. Countdown page (the plan card becomes the end state)
2. Category voting (the host's default category only)
3. Member location sharing (host area only)
4. Group reroll voting (the host rerolls with a cap of 3)
5. Weather penalty (keep the chip, drop the score effect)
6. Live Places (use the seeded pool only)

**Never cut:** RLS privacy, the solver, the lock guard, the seeded fallback pool, the demo seed.

---

## 8. Risks

- **Judges' in-app browsers (Instagram, camera QR) clear localStorage**, which loses member identity. Mitigation: they rejoin with a name. Test on iOS camera QR, Android camera QR, and Instagram early.
- **The host loses their session**, so nobody can lock. Mitigation: create the hangout on the presenter's laptop and keep that tab open. The escape hatch is the Supabase dashboard (set `host_uid` by hand).
- **Places quota, billing or key problems.** There is a fallback pool, and the field mask keeps cost down. Set a billing budget alert and restrict the key to the Places API.
- **Anonymous sign-in abuse.** Enable the rate limit and CAPTCHA, and cap groups at 12.
- **Realtime socket drops** on bad networks. The plan screen re-fetches on reconnect and on focus. Add a 5 s polling fallback only if testing shows it's needed.
- **Timezones.** All wall-clock time is converted in one helper with the zone America/Montreal. Never compare naive times with timestamps.
- **Privacy in small groups.** "1 person" in a group of 2 gives away who it is. The host sees names by design. Accepted.
- **Stack change versus `AGENTS.md`.** Resolved: `AGENTS.md` and `CLAUDE.md` were updated to point at this spec, so agents don't reach for Django.

---

## 9. v3 (designed for, not built)

- **Multi-day:** `hangouts.date_from/date_to` and a `member_days(member_id, date, free_from, free_to)` table with one window per day, toggled on or off. The solver runs per day. It ranks by fairness first and the soonest day second, and a reroll may move to another day.
- **Adjust-or-be-excluded:** when the plan works for N−k members, the host sees "Works for 4 of 5 — ask the others?". Only the outliers get a private prompt ("Can you stretch to 18:00–20:00?") with the answers Yes / Edit my times / Count me out. Then the host runs it again.
- **Google Calendar pre-fill:** optional Google sign-in linked to the anonymous user, and a freebusy read (read-only scope). Propose the largest free window per day, which the member can edit. **"Skip, I'll set times manually"** is always available.
- **Web push reminders:** a service worker and VAPID keys, opt-in on the final page. Sent the day before (multi-day only) and 1–2 h before. A pg_cron job sends any reminder that is due. iOS needs the app on the home screen.

---

## 10. Verification

```
supabase start && supabase db reset          # applies migrations + seed (DEMO42)
deno test supabase/functions/_shared/        # solver unit tests
supabase test db                             # RLS privacy tests (pgTAP). Needs Docker. Without Docker, run the file with:
                                             #   supabase db query --remote --yes --file supabase/tests/database/privacy.test.sql
                                             # (use a scratch copy with finish(true) so a failure exits non-zero; see STATUS.md)
supabase functions serve                     # local function testing
```

Manual demo: create the hangout on the laptop, then join from 3 phones, one on cellular and one through an in-app browser. Check that "Find our plan" stays disabled until 2 people have submitted, and that calling `lock-hangout` from a member's JWT returns 403. Lock, and check that every phone reveals the plan within about 1 s. Vote-reroll until the shared 3 are used up. Check that member buttons switch to "host only" and that the host can still reroll. Then press Let's go. Repeat with the Places key blanked and confirm the plan still comes from the fallback pool.

---

## 11. Proposed amendments (from review, confirm in the group chat)

These are **not adopted yet**. Each one needs a yes from the owner named before it changes the sections above.

1. **Free venues (B, C).** Allow `members.budget` and `venues.price_tier` to be **0–4**, where 0 = free. Places (New) returns `PRICE_LEVEL_FREE`, and the curated seed CSV already uses tier 0. Budget cost becomes `(tier − budget)/4`. Without this, free places are stored as "unknown price".
2. **Winter activities (C).** Exempt `season='winter'` venues (rinks, sledding) from the snow and below −10 °C penalty; they still get the rain penalty. Otherwise winter activities lose points in exactly the weather they're for.
3. **Seed CSV mapping (D).** The deep-research CSV (`name,category,price_tier,lat,lng,open_from,open_to,transit_min,setting,season`) converts into `venues` like this: `setting='outdoor'` → `is_outdoor=true`, `indoor`/`either` → `false`; `season` `warm` → `summer`, `cold` → `winter`, `all` → null; `open_from`/`open_to` → the same period on every weekday in `hours` (a close of `23:59` stays as is); `place_id = 'seed:' + slug(name)`; `source='seed'`; `transit_min` is dropped (travel is computed with haversine).
4. **Local tooling (all).** `supabase start` needs Docker Desktop. Default to one shared cloud project: only B runs `supabase db push`, functions are deployed with `supabase functions deploy`, and solver tests run with plain `deno test`.
5. **Places billing (D).** Set up the billing account, a key restricted to Places API (New) and a budget alert in hour 0. Verify the field-mask SKU claim in §4 on Google's pricing page: `priceLevel`, `rating` and `regularOpeningHours` may bill at a higher tier than basic fields. Cost is still small for a demo.
