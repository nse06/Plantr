# Plantr backlog

Notes and decisions to pick up later. Not yet built unless marked otherwise.

## Indoor and windowsill gardens

**Built:** an "Indoors" garden type with window direction, grow light, pot size and pets; light levels instead of frost; 18 indoor-capable plants plus microgreens; a six-month indoor calendar with re-sowing; a windowsill layout view; indoor tasks, care and shopping; pet-safe picks; and indoor photo analysis (sill length, pots that fit). See the README.

Next ideas:

- **Sill length as an input,** not just from the photo, so we can suggest how many pots fit and warn when the count won't.
- **Summer outside:** when it's warm enough (using the ZIP's frost dates), suggest moving basil and other herbs outdoors, and back in before the first frost.
- **Light check:** a phone-camera light-meter estimate, or a simple "count the hours of direct sun" helper, instead of relying on window direction alone.
- **Countertop systems:** support AeroGarden-style hydroponic units (pod counts, nutrient schedule).
- **Kitchen-scrap regrowing:** celery, lettuce hearts and herbs from cuttings, alongside green onions.

## AI cost reduction plan

Status of the plan from October 2026:

1. **Measure first.** Done: every call is logged to `ai_usage` (tokens, reasoning tokens, estimated cost, latency, outcome). `npm run ai:usage` reports by feature.
2. **Effort sweep.** Tool done (`npm run ai:sweep`). Still to do: run it with a real key on the sample gardens and decide whether design can drop from `medium` to `low` (`PLANTR_DESIGN_EFFORT=low`). Photo analysis already runs at `low`.
3. **Skip AI when it adds little.** Done: `PLANTR_AI_DESIGN=smart` (default) uses the rule-based designer unless there's a photo or typed notes.
4. **Smaller design prompt.** Done: the best-ranked ~24 candidates instead of the whole catalog (about 1.5K input tokens instead of 5K).
5. **Shorter outputs.** Done: one-sentence reasons, a two-sentence summary, three tips.
6. **Smaller photos.** Done: 1024 px on the long edge. Check on real photos that size estimates hold up.
7. **Reuse results.** Done: designs cached by a hash of the prompt and settings (7 days), photos by a hash of the image (30 days).
8. **Model choice last.** Ready: `PLANTR_<FEATURE>_MODEL`. Try Claude Sonnet 5.5 for photo analysis and Ask Plantr with the sweep before switching.
9. **Backstops.** Done in the app: a daily budget (`PLANTR_AI_DAILY_BUDGET_USD`, default $10) and per-IP and per-user rate limits. To do outside the app: set a monthly spend limit in the Claude Console.

Later: per-user monthly AI quotas once there are free and Pro plans (below), and a small admin page for the usage report.

## Pro plan ideas

A paid tier for people who keep gardening after the first plan. Keep the core free (it drives sharing and affiliate revenue): unlimited rule-based plans, a few AI plans with photos each month, one saved garden, the weekly email and a handful of Ask Plantr questions.

**Pricing to test:** about $4.99/month or $29/year. Gardening is seasonal, so lead with the annual price, and consider a one-off "season pass".

Best first bets (high value, cheap to run):

1. **Weather alerts.** Frost, heat-wave and heavy-rain warnings for the user's ZIP from the free National Weather Service API: "Frost tonight. Cover the tomatoes." Strong retention, near-zero cost.
2. **Plant doctor.** Photo diagnosis of pests and diseases with likely cause, confidence, what to do and when to check again (from the full spec). Free users get one a month; Pro gets more, within a quota.
3. **Plan editing.** Drag plants around the layout, and plain-English edits ("swap the kale for chard", "more tomatoes") that the engine re-checks for fit and timing.
4. **Multiple gardens and seasons.** Front yard, balcony and windowsill in one account; spring → summer → fall succession in the same beds; crop rotation that remembers what grew where last year.
5. **Calendar sync and reminders.** An iCal feed of tasks, plus push notifications (the app already has a web manifest).

More ideas:

- **Unlimited Ask Plantr,** with photos.
- **Harvest value tracking:** "You've grown $86 of produce this season", plus an end-of-season report card that seeds next year's plan.
- **Photo timeline:** a growth journal per garden.
- **Seed inventory:** plans use the seeds you already have first, with seed-age reminders.
- **Printable plans:** a PDF of the layout, calendar and shopping list.
- **Sharing:** family members or a partner on the same garden, with task check-offs synced.
- **Indoor Pro:** a grow-light scheduler and light-meter estimate.
- **Regional varieties:** recommendations tuned to the user's state and Cooperative Extension trials.

What it takes to build: Stripe Checkout and the customer portal, a `subscriptions` table, a plan field on users, quota checks next to the existing rate limits, and feature flags so free and Pro share one codebase. A Pro user making about 30 AI calls a month costs roughly $1 in AI at current estimates, comfortably inside $4.99.

## Sharing and community

**Built (October 2026):** opt-in public profiles and garden pages, photo diaries, Explore, cheers, reports with automatic hiding, and an admin review page. See the README.

Next ideas, roughly in order:

- **Cheers in the weekly email:** "3 people cheered your salsa garden this week." Cheap, and it brings people back.
- **Follow gardeners** and a "Following" tab in Explore; filter Explore by zone, indoor/outdoor and goal.
- **Comments,** only once moderation is ready for them: report and delete, a word filter, and maybe comments limited to signed-in accounts older than a day.
- **Automated image screening** on upload (a moderation API) before photo volume grows, plus blocking users.
- **Photo storage:** photos live in the database today (about 250 KB each, so roughly 20,000 photos per 5 GB). Move them to object storage (Vercel Blob or Cloudflare R2) before that, keeping the same `/api/photos/[id]` URLs.
- **Garden of the week** on the landing page, picked from the most-cheered gardens.
- **"Plan one like this" attribution:** count how many plans each public garden inspires, and show it to the owner.

## iPhone app

Today Plantr works on iPhone as a home-screen web app (Safari → Share → Add to Home Screen) with sign-in codes. A native app would add push notifications, widgets and better camera access. The cheapest path is a Capacitor shell around the site, built by GitHub Actions on a macOS runner. That build can be sideloaded (it needs re-signing every 7 days with a free Apple ID) or sent through TestFlight with a $99/year Apple Developer account. For the App Store, Apple rejects thin website wrappers (guideline 4.2), so ship it with real native features: push reminders, a "this week" widget and frost alerts.

## Monetization: affiliate links

- Shopping-list items already have stable ids (`plant:tomato`, `supply:cages`, `soil:raised-mix`, ...). Map them to merchant products in a **separate** table, keeping horticultural data and merchant data apart.
- Add "Buy" links, click tracking and an FTC affiliate disclosure on the shopping list.
- Apply to programs once the site is live with real users. Amazon Associates closes accounts without qualifying sales soon after joining, so time that application for when traffic exists. Garden brands (seeds, planters, raised beds, grow bags) often run programs on affiliate networks that also review the live site.
- Hosting: Vercel's free Hobby plan is for non-commercial use; move to Pro once affiliate links go live.

## Full spec: not yet built

From the full product spec (sections 6–44), still to do:

- Plant health diagnosis from a photo, with likely issue, confidence, what to do, what not to do and when to reassess.
- Plan editing: move, add and remove plants visually, plus plain-English edits ("remove the kale", "more tomatoes") with tradeoff explanations.
- Multiple photos per garden, and confirming, editing or deleting detected objects.
- Soil type (optional) and the full priorities list (maximum food, easiest, lowest maintenance, variety, best-looking, organic, pollinators, kid-friendly, pet-safe, lowest cost).
- Garden types: grow bags, balcony, patio, window box (indoor is built; see above).
- Space-capacity explanations ("room for about 12–16 plants") and optimized trade-offs when the wishlist doesn't fit.
- Companion-planting advice with confidence levels, without folklore presented as fact.
- Fuller data model: GardenPhotos, GardenAreas, GardenPlants, GardenLayouts, GardenTasks, GardenEvents, PlantDiagnoses, ShoppingLists, ShoppingListItems, AIRequests (AIUsage is built as `ai_usage`).
- AI provider abstraction, analytics events and funnel tracking, feature flags (e.g. disable My Garden), and free vs premium limits.
- Landing page copy and the "See an Example" path from the spec.
- Plant data additions: scientific names, USDA zone ranges, heat tolerance, row spacing, soil preferences.
