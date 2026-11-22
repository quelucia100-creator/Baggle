# Baggel

A social planning and activity discovery app.

**Mission:** Make it effortless for students to turn free time into real-life experiences with friends.

Baggel answers three simple questions:

- **Who is free?**
- **What should we do?**
- **Where and when should we do it?**

Instead of spending hours coordinating plans in group chats, users can discover activities, match their availability, and make group decisions in minutes.

## The problem

People want to do things together, but planning becomes more difficult than the activity itself. Students face endless group chats without decisions, repeated suggestions of the same activities, unclear locations, costs, and timing, and too much effort required to organize something simple.

## Who it's for

University and college students — especially those living on or near campus and new students looking to build social circles. The recommended starting point is one campus: a concentrated user base with nearby activities, shared schedules, and existing social connections.

## What the app does

### Parties and planning

- **Guest parties:** anyone can create a party or join one with a six-character code — no account needed. Hosts configure the category, date, duration, and meeting area.
- **Private preferences:** each member answers a short, one-question-at-a-time wizard — availability, budget, max travel time, and an optional rough starting area. Preferences stay private: hosts and other members only ever see whether someone has submitted, never their answers.
- **Find event:** once at least two members are ready, the host generates a shared plan. A fairness solver ranks real venues (via Google Maps) against everyone's private constraints and returns one venue and time with a public price tier, local times, a Maps link, and an optional weather forecast.
- **Rerolls and finalization:** members vote to reroll; the host rerolls or finalizes the plan. If no option fits, the app says so neutrally and the host can reopen planning.
- **Map and weather:** a shared map shows the meeting area and forecast, requesting location only when needed.

### Accounts and social features

Signed-in users (Google or email) get:

- **Dashboard** with quick access to everything, including joining a party by code.
- **Friends:** send and accept friend requests by username.
- **Groups:** create groups of friends, see the recurring weekdays when *all* members are free (without revealing anyone's private schedule), and poke the group to hang out.
- **Availability:** a recurring Monday–Sunday availability grid, kept private and separate from party submissions.
- **Notifications:** friend requests, group invites, and group journey alerts, with an unread indicator.
- **Preferences:** mandatory onboarding (username, date of birth, tastes, dietary restrictions and allergies, accessibility, alcohol presence, activity interests), editable later, plus a public/private account toggle.

### Design

A playful, gamified look grounded in realism: real bagel photography, paper textures with subtle grain, pop shadows, and a fixed colour palette (off white, chartreuse, sage, apricot, tangerine, vista, cream, crust brown). No emojis — icons are coloured-paper cutouts.

## Tech stack

- **Frontend:** React 19, TanStack Start (SSR), TanStack Router, Tailwind CSS v4, shadcn-style components
- **Backend:** Lovable Cloud (managed Postgres, auth, and server functions)
- **Maps and places:** Google Maps Platform
- **Testing:** Vitest

## Development

This project is built with [Lovable](https://lovable.dev). Continue developing in the [Lovable editor](https://lovable.dev/projects/c9d12ae2-be6f-447b-b56a-0abb152936c7) — every change is committed straight to this repository, and pushes to `main` on GitHub sync back into Lovable.

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

Run the test suite with:

```sh
npm test
```

## Documentation

Detailed design and integration notes live in [`docs/`](docs/), including the planning contract, frontend handoff, and flow references.
