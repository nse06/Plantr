# 🌱 Plantr

**Take a photo of your space, tell us what you want to grow, and we'll tell you exactly what to plant, where to put it, and when to do it.**

Plantr is a consumer web app that helps beginner and casual U.S. gardeners design, plan and keep up with a home garden: beds, a patio of containers, or a windowsill. It's built mobile-first and works without an account; saving a plan unlocks weekly reminders, task check-offs, a harvest log and garden-aware Q&A.

| Layer | What the gardener gets |
| --- | --- |
| **1. Garden planner**: the "wow" | A 2-minute, five-step wizard: photo of the space (AI estimates size and sun), ZIP code (local frost dates and temperatures), goals and favorite plants, a quick confirmation of the space, and a little about the household. |
| **2. Garden plan**: the useful output | Bed-by-bed **layout** (square-foot grid, tall crops on the north side), **plant list** with varieties, quantities and spacing, a **planting calendar** with seed-starting, planting and harvest windows, a dated **task list**, a **maintenance schedule**, a priced **shopping list**, and the **reasoning** behind every choice (including what was left out and why). |
| **3. My Garden**: retention | Save the plan to get a **weekly email** of exactly what to do, a **"This week"** checklist, plant stages, a **harvest log and notes**, a **photo diary**, **Ask Plantr** (answers that know your zone, plants and calendar), and a nudge to plan the next season when this one wraps up. Gardeners can **share a garden on a public profile**, where others can cheer it and plan one like it. |

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
- **The AI is used where it earns its cost.** By default the rule-based designer handles plans with nothing to interpret (no photo, no typed notes), and the model is called for photos and for people's own words. See [AI cost controls](#ai-cost-controls).

### Indoor and windowsill gardens

Choose **Indoors** in the wizard (or start from `/plan/new?space=indoor`). Light, not frost, is the limit indoors, so the engine works differently:

- **Light:** the window's direction (south is brightest in the U.S.) and whether there's a grow light set a light level from 1 to 3. Each indoor-capable plant needs a minimum level; fruiting crops (dwarf cherry tomatoes, hot peppers, strawberries) need a grow light.
- **Pots:** pots are sized in inches (4–12 in). Every indoor plant has a smallest workable pot and a plants-per-pot rule, and plans fill every pot on the sill.
- **Calendar:** plans start a few days from today and run for six months at room temperature, with re-sowing for quick crops (microgreens every 2 weeks, lettuce and arugula every 3). Herbs bought as plants, green onions regrown from grocery-store scraps, and seeds each get their own steps.
- **Pets:** with cats or dogs at home, plants on the ASPCA toxic list (chives, green onions, mint, oregano, parsley, tomato leaves) are left out unless the person asks for them, and then they get a warning.
- **Everything else follows:** a windowsill layout view, indoor tasks (pots and saucers, grow-light timer, hand-pollinating, fungus gnats), an indoor shopping list, indoor care advice, and photo analysis that estimates sill length and how many pots fit.

### Sharing gardens

Sharing is off until a gardener turns it on for a garden ("Share on your profile" on the garden page).

- **Pages:** a public garden page (`/g/[id]`) with photos, layout, crops and progress; a profile (`/u/[handle]`) listing someone's shared gardens; and **Explore** (`/explore`), the most recently active shared gardens. Every public garden ends with "Plan my garden", which starts the wizard with the same goals.
- **Photos:** owners post photo updates from the garden page. The browser resizes them (1280 px, plus a 720 px thumbnail), and the server checks they're real JPEGs and strips metadata (EXIF, including GPS location) before storing them in the database, up to 60 per garden.
- **Profiles:** a handle is created the first time someone shares (a random one like `leafy-radish-27`, never derived from their email), and can be changed on the account page along with a display name and short bio.
- **Cheers and reports:** signed-in visitors can cheer a garden (one per person), and the weekly email tells the owner about the week's new cheers, naming cheerers who have public profiles; a week with new cheers gets an email even if there's nothing to do. Anyone can report a garden or photo; three distinct reports hide it until an admin keeps or removes it at `/admin` (admins are listed in `ADMIN_EMAILS`).
- **Privacy:** public pages show the state and growing zone, never the ZIP code or email address.

### On iPhone

Plantr is a website, so there's nothing to install from an app store or sideload. Open it in Safari, tap **Share → Add to Home Screen**, and it opens full screen like an app. Sign-in emails include a 6-digit code as well as a link, because a home-screen web app keeps its own cookies apart from Safari (tapping the emailed link would sign in Safari, not the app).

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

`src/lib/garden/plants.ts` holds 48 curated vegetables, herbs, flowers and fruit with spacing, timing relative to frost, days to maturity, harvest length, sun, water, feeding, supports, container sizes, companions and conflicts, beginner-friendly varieties, tips and typical prices. 18 of them also carry indoor rules (light needed, smallest pot, plants per pot, how to start, days to harvest, re-sowing, compact varieties) and pet warnings. This data is the backbone of every plan, so it lives in code, versioned and unit-tested.

---

## Tech stack (and why)

| Choice | Why |
| --- | --- |
| **Next.js 16 (App Router) + React 19 + TypeScript** | One codebase for pages and API routes; server components keep pages fast on phones; trivial to deploy. |
| **Tailwind CSS v4** | Fast to build a polished, consistent, mobile-first UI with a small design system (`src/app/globals.css`, `src/components/ui.tsx`). |
| **Drizzle ORM + libSQL** | A local SQLite file with zero setup in development; [Turso](https://turso.tech) (hosted libSQL) in production for pennies, with typed queries and SQL migrations. |
| **Anthropic Claude** (`@anthropic-ai/sdk`) | Vision for photo analysis, structured outputs for garden design, short answers for Ask Plantr. Server-side refusal fallbacks are enabled. |
| **Passwordless email sign-in** (built in) + **Resend** | No passwords to manage; a one-time link and a 6-digit code in each email, sent with a plain HTTP call; emails print to the console in development. |
| **Vercel** (+ Vercel Cron) | Zero-config hosting for Next.js; a weekly cron sends the digest. |

There are no other services: no queue, no object storage (shared photos live in the database, which is fine for thousands of photos; see the backlog for when to move them), and no separate backend.

## Project structure

```
src/
  app/                     Pages and API route handlers (App Router)
    page.tsx               Landing page (hero preview is a real engine-generated plan)
    plan/new/              The wizard
    plan/[id]/             Plan view: overview, layout, plants, calendar, shopping, care
    garden/                My Garden dashboard and per-garden home
    explore, u/[handle], g/[id]   Shared gardens: Explore, profiles, public garden pages
    admin/                 Moderation of reported gardens and photos
    login, auth/verify     Passwordless sign-in
    account, privacy, unsubscribed
    api/                   climate, photo, plans, gardens/[id]/{save,tasks,journal,ask,
                           photos,share,cheer}, photos/[id], profile, reports,
                           admin/reports, auth/{request,verify,code,logout}, account,
                           cron/weekly-digest, digest/unsubscribe
  components/              UI: design system, wizard, plan view, garden home, visuals,
                           social (photos, sharing, cheers, reports, profiles)
  lib/garden/              The planting engine (pure, shared by server and browser)
    plants.ts              Plant catalog
    climate.ts, temps.ts   Climate helpers, temperature interpolation
    schedule.ts            Season-aware planting calendar per plant
    recommend.ts           Feasibility, rule-based designer, design normalization
    indoor.ts              Indoor light levels, pot sizes, feasibility and calendar
    layout.ts              Square-foot bed layout and container assignment
    tasks.ts, shopping.ts  Dated task list and priced shopping list
    plan.ts                buildPlan(): ties it all together
    data/                  Bundled NOAA station and ZIP data (server-only)
  lib/ai/                  Claude integrations: photo.ts, design.ts, ask.ts, plus
                           client.ts (per-feature settings), pricing.ts, usage.ts
                           (usage log, daily budget, result cache)
  lib/server/              Auth, sessions, gardens data access, sharing (social.ts),
                           JPEG checks, rate limiting, email, weekly digest, climate
                           lookup, plan generation
  db/                      Drizzle schema and client
drizzle/                   SQL migrations
scripts/                   migrate.ts, build_climate_data.py, ai-usage.ts, ai-sweep.ts
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
| `PLANTR_AI_DESIGN` | Optional | `smart` (default), `always` or `never`. See [AI cost controls](#ai-cost-controls). |
| `PLANTR_AI_DAILY_BUDGET_USD` | Optional | Estimated daily AI spend cap. Default `10`; `off` removes it. |
| `PLANTR_<FEATURE>_EFFORT`, `PLANTR_<FEATURE>_MODEL` | Optional | Per-feature effort and model, where the feature is `PHOTO`, `DESIGN` or `ASK`. |
| `DATABASE_URL` / `DATABASE_AUTH_TOKEN` | Production | Turso URL and token (the Vercel Turso integration's `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` also work). Defaults to `file:local.db`. |
| `AUTH_SECRET` | Production | Signs unsubscribe links. `openssl rand -base64 32`. |
| `APP_URL` | Production | Public URL used in emailed links. Never derived from request headers in production. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Production | Sign-in links and the weekly digest. Use a verified sending domain. |
| `CRON_SECRET` | Production | Vercel Cron sends it to `/api/cron/weekly-digest`. |
| `ADMIN_EMAILS` | Optional | Comma-separated emails that can review reports at `/admin`. |

## Deploying (Vercel + Turso + Resend)

1. **Database:** create a Turso database (`turso db create plantr`), then get `DATABASE_URL` (`turso db show --url plantr`) and a token (`turso db tokens create plantr`).
2. **Email:** create a Resend API key and verify your sending domain.
3. **Vercel:** import the repo and set the environment variables above. The `vercel-build` script runs migrations before every build, and refuses to deploy against a local SQLite file.
4. **Cron:** `vercel.json` schedules the weekly digest for Thursdays at 13:00 UTC (morning across the U.S.). Set `CRON_SECRET` so only Vercel can trigger it.

The plan and photo endpoints set `maxDuration = 120`. AI design typically takes 15–40 seconds, and the rule-based designer takes over if the model doesn't answer in time.

## Security and privacy

- Session and sign-in tokens are random and stored only as SHA-256 hashes. Cookies are `HttpOnly`, `SameSite=Lax` and `Secure` in production.
- Sign-in links are one-time, expire after 30 minutes, and need a button tap, so email scanners that pre-fetch links can't use them up. The 6-digit code in the same email is stored as a signed hash, allows five wrong guesses, and is rate-limited per email and per IP.
- Shared content is opt-in. Uploaded photos are checked to be JPEGs and stripped of metadata (including GPS), public pages never show ZIP codes or emails, and reported content is hidden after three distinct reports until an admin reviews it.
- All input is validated with Zod, mutating endpoints check the `Origin` header, and redirects are restricted to in-app paths.
- Database-backed rate limits protect the AI and email endpoints (per IP, per email, per user).
- Only a small photo thumbnail is stored. AI results (never photos) are cached for up to 30 days under a one-way hash of the request. Users can delete their account and all data from the account page. Every digest email has a signed one-click unsubscribe (RFC 8058).

## Operating cost

- **AI:** about **$0.06–0.11 for a plan with a photo** and **$0.04–0.08 for one with typed notes** at Claude Opus 5.5 rates ($4 / $20 per million input/output tokens). Plans with neither cost nothing, because the rule-based designer handles them. Ask Plantr answers are a cent or two. These are estimates from prompt sizes; `npm run ai:usage` reports the real numbers once there's traffic.
- **Everything else** fits in the free or hobby tiers of Vercel, Turso and Resend at launch scale.

### AI cost controls

Most of the cost is output tokens, and most of those are the model's reasoning, so the main levers are how often the model is called and how hard it thinks.

| Control | Default | What it does |
| --- | --- | --- |
| Smart design (`PLANTR_AI_DESIGN`) | `smart` | Calls the AI designer only when there's a photo or typed notes. `always` or `never` override it. |
| Effort (`PLANTR_<FEATURE>_EFFORT`) | photo `low`, design `medium`, ask `low` | Reasoning effort per feature: `low`, `medium` or `high`. |
| Model (`PLANTR_<FEATURE>_MODEL`) | `PLANTR_MODEL` | A cheaper model for one feature, e.g. `PLANTR_ASK_MODEL=claude-sonnet-5-5`. Parameters a model doesn't accept are dropped automatically. |
| Compact design prompt | always on | Only the best-ranked ~24 plants that work for this garden, not the whole catalog: about 1.5K input tokens instead of 5K. Short reasons, two-sentence summary, three tips. |
| Smaller photos | always on | Photos are resized to 1024 px in the browser: about 1K image tokens instead of 2.5K. |
| Result cache (`PLANTR_AI_CACHE`) | on | Identical design requests and repeat photos reuse the earlier result (7 and 30 days). |
| Daily budget (`PLANTR_AI_DAILY_BUDGET_USD`) | `10` | Once the day's estimated spend reaches the cap, plans use the rule-based designer until midnight UTC. Also set a monthly spend limit in the Claude Console. |
| Rate limits | always on | Per IP and per user, on photos, plans and questions. |

Every call is logged to the `ai_usage` table with tokens, reasoning tokens, estimated cost, latency and outcome.

```bash
npm run ai:usage                 # spend and tokens by feature, last 1, 7 and 30 days
npm run ai:sweep                 # plan a comparison of effort levels (sends nothing)
npm run ai:sweep -- --yes        # run it: 6 sample gardens × low and medium effort
npm run ai:sweep -- --yes --efforts low --models claude-opus-5-5,claude-sonnet-5-5
```

The sweep prints tokens, cost and latency per setting, then the plans side by side. Switch to a cheaper setting only if the plans still read well.

## Testing

`npm test` runs the test suite. It covers dates, frost-date math, scheduling across real climates (Seattle, Chicago, Denver, Phoenix, Miami, Austin), layout packing, recommendations, indoor light, pots, pets and calendars, the AI prompt, cost estimates and settings, request validation, digest rendering and signed links. The sharing and sign-in tests run the real data layer against a throwaway SQLite database: codes, profiles, visibility, photo metadata stripping, cheers, reports, moderation and account deletion.

## Roadmap ideas

See [docs/BACKLOG.md](docs/BACKLOG.md) for the full list, including Pro-plan ideas and remaining spec items.

- Push notifications and an installable PWA experience (the manifest is in place).
- Regenerate a plan mid-season and carry over completed tasks.
- Multiple photos per garden and a progress photo timeline.
- More plants (perennials like asparagus and berries) and regional variety recommendations.
