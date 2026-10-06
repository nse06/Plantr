# Plantr — build plan (resume notes)

Decisions made so far (session paused for token limits):

- **Stack:** Next.js (App Router) + TypeScript + Tailwind, deploy on Vercel.
- **DB:** Drizzle ORM + libSQL (local `file:local.db`, Turso in prod).
- **Auth:** custom email magic link (tokens in DB, session cookie). Email via Resend HTTP API, console fallback in dev. Guests can build plans and claim them after signing in.
- **Photos:** client-side downscale; send to Claude vision for space analysis; store only a small thumbnail in DB (no blob storage).
- **AI:** `@anthropic-ai/sdk`, model `claude-opus-5-5`, structured outputs (`zodOutputFormat`), `fallbacks: "default"` + beta `server-side-fallback-2026-07-01`. AI picks plants, varieties and quantities and writes the reasoning. A deterministic engine computes dates, spacing, layout and the shopping list. The app still works without an API key (rule-based fallback).
- **Climate data:** ZIP → zone via phzmapi.org (`https://phzmapi.org/{zip}.json`, reachable), cached; zone-based frost-date table; ZIP3→state fallback.
- **Plant DB:** curated deterministic data (~50 vegetables, herbs and flowers) with spacing, sun, days to maturity, indoor/direct-sow/transplant timing, companions, height and container suitability.
- **Layout:** square-foot grid placement (tall plants on the north side), rendered as SVG.
- **Flows:** wizard (photo → ZIP → goals/plants → space confirm → generate) → plan page (Layout, Plants, Calendar, Care, Shopping, Why) → My Garden (this-week tasks, checklist, harvest log, weekly email digest via Vercel Cron).

Note: the original spec was cut off at "Layer 3 — My Garden … Weekly/sea[sonal]…"; the remaining scope is inferred.
