<div align="center">

# 🥯 Baggel

**Turn free time into real-life plans with friends, in minutes.**

A social planning and activity discovery app for students.

[Problem](#the-problem) · [Features](#features) · [Tech stack](#tech-stack) · [Getting started](#getting-started) · [Architecture](#architecture) · [Roadmap](#roadmap)

</div>

---

## What is Baggel?

Baggel answers three simple questions:

1. **Who is free?**
2. **What should we do?**
3. **Where and when should we do it?**

Instead of spending hours negotiating in group chats, friends match their availability, discover activities nearby, and settle on a plan together.

> **Mission:** make it effortless for students to turn free time into real-life experiences with friends.
>
> **North-star metric:** group plans confirmed with an activity, time and place each week.

## The problem

Students want to socialize and explore, but planning often becomes harder than the activity itself. Common blockers include low motivation, feeling overwhelmed, bad weather, not knowing what to do or where to go, and tight budgets.

**People want to do things together, but coordinating it gets in the way.**

## Who it's for

- **Primary:** university and college students (roughly 18-25) and existing friend groups that struggle to coordinate.
- **Future:** teenagers and pre-teens (with appropriate safeguarding and privacy protections), young professionals, and newcomers to a city.

## Features

### Get in your way, your way
- **Guest mode:** create a party or join with a six-character code, no account needed. Invite friends by QR code.
- **Accounts:** sign up with Google or email, pick a unique username, and set a password that meets secure requirements.
- **Preferences:** a step-by-step setup for food preferences, budget and other tastes, saved as you go.

### Plan together
- **Host-first planning:** the host chooses the date range, meeting area and activity category (park, cafe, museum, restaurant or activity).
- **Private member inputs:** each member submits their own budget, free time window and maximum travel time. Nobody sees anyone else's limits.
- **Smart ranking:** the host locks the plan, and Baggel ranks venues that fit everyone's constraints, using opening hours, travel time and weather.
- **Group decision:** members vote on the proposed option, and the host can reroll to the next stored option or finalize the plan.
- **Export:** finalized plans can be added to a calendar via `.ics`.

### Stay connected
- **Friends and groups:** keep recurring crews together.
- **Weekly openings:** see when *everyone* in a group is free, without exposing individual schedules.
- **Pokes and notifications:** nudge friends when a shared opening appears.
- **Journey and map:** a shared party journey with a per-member map view.

### Playful by design
A mix of gamified, playful elements and realism: real textures and real bagel imagery for a "pop" effect, animated bagel loaders and transitions, and sound effects. All colours come from a single palette.

## Tech stack

| Area | Technology |
| --- | --- |
| Framework | [TanStack Start](https://tanstack.com/start) + [TanStack Router](https://tanstack.com/router), React 19, TypeScript |
| Build | Vite, Bun |
| Styling and UI | Tailwind CSS v4, Radix UI primitives, shadcn-style components, Lucide icons, Sonner, Vaul |
| Data and forms | TanStack Query, React Hook Form, Zod |
| Backend | Supabase (Postgres, auth, RPCs), Drizzle migrations, built with [Lovable](https://lovable.dev) |
| Maps and weather | Google Maps / Places via a server-side gateway, Open-Meteo |
| Time | `date-fns`, Temporal polyfill (Montreal civil time) |
| Testing and quality | Vitest, Testing Library, ESLint, Prettier |

## Getting started

### Prerequisites

- [Bun](https://bun.sh) (the repo ships a `bun.lock`)
- A Supabase project (or a local or isolated instance) with the project's migrations applied

### Install and run

```bash
git clone https://github.com/quelucia100-creator/baggel.git
cd baggel
bun install
bun run dev
```

### Environment variables

Create a `.env` file (never commit real secrets):

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser | Supabase publishable key |
| `SUPABASE_URL` | Server | Supabase project URL for server functions |
| `SUPABASE_PUBLISHABLE_KEY` | Server | Publishable key for server functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Service role key, **server-only** |
| `GOOGLE_PLACES_API_KEY` | Server, optional | Venue search; without it, a fallback catalogue is used |

Open-Meteo weather needs no key.

### Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Start the dev server |
| `bun run build` | Production build |
| `bun run preview` | Preview the production build |
| `bun run test` | Run the test suite once |
| `bun run test:watch` | Run tests in watch mode |
| `bun run lint` | Lint the codebase |
| `bun run format` | Format with Prettier |

## Architecture

```
src/
├── routes/          File-based routes (auth, party, planning, account pages)
├── components/      Shared UI, auth shell, bagel scene and loaders
│   ├── planning/    Planning wizards, lifecycle screens and v3 flow
│   └── ui/          Radix-based design-system components
├── lib/             Party access, account logic, weather, planning client
│   └── planning-v3/ Ranking solver, venue and travel logic, server functions
└── assets/          Bagel imagery, textures, audio
drizzle/migrations/  Database schema history
docs/                Planning contracts and handoff documentation
```

### How planning works

```
collecting  →  locking  →  locked  →  final
                  │           │
                  └──→  no plan  ──(host reopens)──→  collecting
```

1. **Collecting:** the host configures the plan and members submit private preferences.
2. **Locking:** the host locks the plan (at least two submissions). The server ranks options once.
3. **Locked:** members vote. The host can reroll through stored options.
4. **Final:** the host finalizes and everyone sees the chosen plan.
5. **No plan:** if nothing fits, the host can reopen with submissions kept.

Full details are in [`docs/FRONTEND-HANDOFF.md`](docs/FRONTEND-HANDOFF.md) and [`docs/planning-v3/`](docs/planning-v3/).

### Privacy by design

- Guests are identified by hashed, random **membership capability tokens**, kept out of URLs, logs and shared caches.
- Private preferences have no client table grants. Hosts and guests cannot read each other's limits.
- Shared plan options are **allowlist-projected in SQL**, so results never leak individual constraints.
- Group openings are computed in the database and return only confirmed all-member intersections.
- Maps and weather are fetched server-side, so provider keys never reach the browser.

## Roadmap

- [ ] Roll out Google Places in production once data retention and attribution are resolved
- [ ] More activity categories and richer venue data
- [ ] Safeguarding and privacy features for younger audiences
- [ ] Support for young professionals and newcomers to a city

## Contributing

1. Create a branch from `main`.
2. Run `bun run lint` and `bun run test` before opening a PR.
3. This project is connected to Lovable: avoid rewriting published git history, and keep the connected branch in a working state.
4. Database schema changes are managed through Lovable rather than edited by hand.

## License

No license has been specified yet. Add one before accepting outside contributions.
