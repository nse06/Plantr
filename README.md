# 🌱 Plantr

**Take a photo of your space, tell us what you want to grow, and we'll tell you exactly what to plant, where to put it, and when to do it.**

Plantr is a consumer web app that helps beginner and casual U.S. gardeners design, plan and keep up with a home garden. It's built mobile-first and works without an account; saving a plan unlocks weekly reminders, task check-offs, a harvest log and garden-aware Q&A.

| Layer | What the gardener gets |
| --- | --- |
| **1. Garden planner**: the "wow" | A 2-minute, five-step wizard: photo of the space (AI estimates size and sun), ZIP code (local frost dates and temperatures), goals and favorite plants, a quick confirmation of the space, and a little about the household. |
| **2. Garden plan**: the useful output | Bed-by-bed **layout** (square-foot grid, tall crops on the north side), **plant list** with varieties, quantities and spacing, a **planting calendar** with seed-starting, planting and harvest windows, a dated **task list**, a **maintenance schedule**, a priced **shopping list**, and the **reasoning** behind every choice (including what was left out and why). |
| **3. My Garden**: retention | Save the plan to get a **weekly email** of exactly what to do, a **"This week"** checklist, plant stages, a **harvest log and notes**, **Ask Plantr** (answers that know your zone, plants and calendar), and a nudge to plan the next season when this one wraps up. |

---

## How the planning works

Plantr deliberately splits the work between **AI judgment** and a **deterministic planting engine**, so plans are personal *and* always correct and buildable:

```
 photo ──► Claude vision ──► space estimate (type, size, sun) ──► user confirms
                                                                      │
 ZIP ──► NOAA station normals + USDA zone ──► frost dates, monthly temps
                                                                      ▼
                         ┌───────────── planting engine (src/lib/garden) ─────────────┐
 goals, wants, notes ──► │ feasibility: season timing · sun · containers · heat/cold │
                         │                     │                                      │
                         │       Claude designer (or rule-based fallback)              │
                         │       picks plants, varieties, quantities, reasons          │
                         │                     ▼                                      │
                         │ normalize → fit to space → layout → schedule → tasks →     │
                         │ shopping list                                              │
                         └────────────────────────────────────────────────────────────┘
```

- **The model decides _what_** to grow, how much, which variety and why, from a list of plants the engine has already confirmed will work for that place, season, sun and space. Structured outputs keep the response machine-readable.
- **The engine decides _where_ and _when_.** It owns every date, spacing rule and square foot, so an AI mistake can never produce an impossible plan. Unknown or infeasible picks are dropped (with a reason), quantities are fitted to the real space, and plants the user explicitly asked for are never silently ignored.
- **No API key? Still a great plan.** A rule-based designer scores the catalog against the user's goals, notes, experience, time, sun and space, balances goals round-robin and sizes quantities to the household. It's also the automatic fallback if the AI call fails or times out.

### Climate data

Every date depends on local climate, so Plantr bundles real data instead of guessing from the hardiness zone alone:

- **NOAA U.S. Climate Normals 1991–2020** for 7,084 weather stations: median last and first 32 °F frost dates plus monthly normal lows and highs.
- **Census 2023 ZCTA centroids** map each of ~33,800 ZIP codes to its nearest station.
- **USDA hardiness zone** from the public [phzmapi.org](https://phzmapi.org) lookup, with a regional fallback.

The temperatures power rules that frost dates alone get wrong:

- Warm-season crops wait for nights reliably above 50 °F (55 °F for okra and melons). In Seattle the last frost is in March but tomatoes go in around **May 22**, matching local extension advice.
- Lettuce, spinach, cilantro and other bolting crops stay ahead of 85 °F days in spring and wait for the heat to break in fall.
- Tomatoes, peppers and beans pause when summer nights stay above 75 °F, so a Phoenix plan plants tomatoes in **February** and wraps the harvest in June.

Regenerate the data with `npm run data:climate` (see `scripts/build_climate_data.py` for the source URLs).

### Plant catalog

`src/lib/garden/plants.ts` holds 47 curated vegetables, herbs, flowers and fruit with spacing, timing relative to frost, days to maturity, harvest length, sun, water, feeding, supports, container sizes, companions and conflicts, beginner-friendly varieties, tips and typical prices. This data is the backbone of every plan, so it lives in code, versioned and unit-tested.

---

## Tech stack (and why)

| Choice | Why |
| --- | --- |
| **Next.js 16 (App Router) + React 19 + TypeScript** | One codebase for pages and API routes; server components keep pages fast on phones; trivial to deploy. |
| **Tailwind CSS v4** | Fast to build a polished, consistent, mobile-first UI with a small design system (`src/app/globals.css`, `src/components/ui.tsx`). |
| **Drizzle ORM + libSQL** | A local SQLite file with zero setup in development; [Turso](https://turso.tech) (hosted libSQL) in production for pennies, with typed queries and SQL migrations. |
| **Anthropic Claude** (`@anthropic-ai/sdk`) | Vision for photo analysis, structured outputs for garden design, short answers for Ask Plantr. Server-side refusal fallbacks are enabled. |
| **Passwordless email sign-in** (built in) + **Resend** | No passwords to manage; magic links via a plain HTTP call; emails print to the console in development. |
| **Vercel** (+ Vercel Cron) | Zero-config hosting for Next.js; a weekly cron sends the digest. |

There are no other services: no queue, no object storage (only a small photo thumbnail is kept), and no separate backend.

## Project structure

```
src/
  app/                     Pages and API route handlers (App Router)
    page.tsx               Landing page (hero preview is a real engine-generated plan)
    plan/new/              The wizard
    plan/[id]/             Plan view: overview, layout, plants, calendar, shopping, care
    garden/                My Garden dashboard and per-garden home
    login, auth/verify     Passwordless sign-in
    account, privacy, unsubscribed
    api/                   climate, photo, plans, gardens/[id]/{save,tasks,journal,ask},
                           auth/{request,verify,logout}, account, cron/weekly-digest,
                           digest/unsubscribe
  components/              UI: design system, wizard, plan view, garden home, visuals
  lib/garden/              The planting engine (pure, shared by server and browser)
    plants.ts              Plant catalog
    climate.ts, temps.ts   Climate helpers, temperature interpolation
    schedule.ts            Season-aware planting calendar per plant
    recommend.ts           Feasibility, rule-based designer, design normalization
    layout.ts              Square-foot bed layout and container assignment
    tasks.ts, shopping.ts  Dated task list and priced shopping list
    plan.ts                buildPlan(): ties it all together
    data/                  Bundled NOAA station and ZIP data (server-only)
  lib/ai/                  Claude integrations: photo.ts, design.ts, ask.ts
  lib/server/              Auth, sessions, gardens data access, rate limiting, email,
                           weekly digest, climate lookup, plan generation
  db/                      Drizzle schema and client
drizzle/                   SQL migrations
scripts/                   migrate.ts, build_climate_data.py
```

---

## Running locally

Requires Node.js 20.9+.

```bash
npm install
npm run dev          # applies migrations to ./local.db, then starts http://localhost:3000
```

That's it: with no environment variables Plantr uses a local SQLite file, prints sign-in emails to the terminal (and shows the link on screen in development), and plans with the rule-based designer. To enable AI, copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`.

```bash
npm run check        # lint + typecheck + unit tests
npm run build        # production build
```

### Environment variables

| Variable | Needed for | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | AI features | Photo analysis, AI design, Ask Plantr. Without it, everything else still works. |
| `PLANTR_MODEL` | Optional | Defaults to `claude-opus-5-5`. |
| `DATABASE_URL` / `DATABASE_AUTH_TOKEN` | Production | Turso URL and token. Defaults to `file:local.db`. |
| `AUTH_SECRET` | Production | Signs unsubscribe links. `openssl rand -base64 32`. |
| `APP_URL` | Production | Public URL used in emailed links. Never derived from request headers in production. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Production | Sign-in links and the weekly digest. Use a verified sending domain. |
| `CRON_SECRET` | Production | Vercel Cron sends it to `/api/cron/weekly-digest`. |

## Deploying (Vercel + Turso + Resend)

1. **Database:** create a Turso database (`turso db create plantr`), then get `DATABASE_URL` (`turso db show --url plantr`) and a token (`turso db tokens create plantr`).
2. **Email:** create a Resend API key and verify your sending domain.
3. **Vercel:** import the repo and set the environment variables above. The `vercel-build` script runs migrations before every build, and refuses to deploy against a local SQLite file.
4. **Cron:** `vercel.json` schedules the weekly digest for Thursdays at 13:00 UTC (morning across the U.S.). Set `CRON_SECRET` so only Vercel can trigger it.

The plan and photo endpoints set `maxDuration = 120`. AI design typically takes 15–40 seconds, and the rule-based designer takes over if the model doesn't answer in time.

## Security and privacy

- Session and sign-in tokens are random and stored only as SHA-256 hashes. Cookies are `HttpOnly`, `SameSite=Lax` and `Secure` in production.
- Sign-in links are one-time, expire after 30 minutes, and need a button tap, so email scanners that pre-fetch links can't use them up.
- All input is validated with Zod, mutating endpoints check the `Origin` header, and redirects are restricted to in-app paths.
- Database-backed rate limits protect the AI and email endpoints (per IP, per email, per user).
- Only a small photo thumbnail is stored. Users can delete their account and all data from the account page. Every digest email has a signed one-click unsubscribe (RFC 8058).

## Operating cost

- **AI:** at Claude Opus 5.5 rates ($4 / $20 per million input/output tokens), a full plan with a photo uses roughly 10–15K tokens, about **$0.10–0.20 per plan** (an estimate; it varies with the garden and the model's reasoning). Ask Plantr answers are a few cents. Set `PLANTR_MODEL` to trade quality for cost.
- **Everything else** fits in the free or hobby tiers of Vercel, Turso and Resend at launch scale.

## Testing

`npm test` runs the engine test suite. It covers dates, frost-date math, scheduling across real climates (Seattle, Chicago, Denver, Phoenix, Miami, Austin), layout packing, recommendations, digest rendering and signed links.

## Roadmap ideas

- Push notifications and an installable PWA experience (the manifest is in place).
- Regenerate a plan mid-season and carry over completed tasks.
- Multiple photos per garden and a progress photo timeline.
- More plants (perennials like asparagus and berries) and regional variety recommendations.
