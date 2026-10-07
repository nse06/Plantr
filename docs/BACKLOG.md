# Plantr backlog

Notes and decisions to pick up later. Not yet built unless marked otherwise.

## Indoor and windowsill gardens

Make Plantr work for people growing indoors: a windowsill, a sunny shelf, or a grow light.

- **New garden type:** "Indoor / windowsill" (alongside in-ground, raised bed, containers).
- **Light, not frost, is the constraint.** Ask which way the window faces (south-facing gets the most light in the U.S.) and whether they have, or are willing to buy, a grow light. Translate that into light hours, as we do for outdoor sun.
- **No frost calendar.** Indoor plans run year-round at room temperature (~65–75 °F). Schedule from the start date: sow → sprout → first harvest, with re-sowing every 2–3 weeks for greens and microgreens.
- **Plant data:** add indoor suitability per plant: minimum light hours, whether a grow light is needed, smallest workable pot. Good indoor picks: basil, chives, parsley, mint, thyme, oregano, green onions (regrow from scraps), lettuce and baby greens, arugula, microgreens; dwarf cherry tomatoes, hot peppers and strawberries only with a grow light.
- **Layout:** a windowsill view (a row of pots along the ledge, sized to the sill width) instead of the square-foot bed grid.
- **Care:** indoor pots dry out differently than outdoor ones. Cover drainage and saucers, low humidity in winter, fungus gnats and aphids, and the lower feeding needs of herbs.
- **Pet safety matters more indoors** (cats chew houseplants). Tie into the pet-safe priority; e.g. tomato and pepper leaves are toxic to pets.
- **Shopping list:** small pots with saucers, potting mix, seed-starting trays, grow light, plant labels.
- **Photo analysis:** detect a window, sill depth and width, and nearby obstructions; still ask the user to confirm the window direction.

## AI cost reduction plan

Current estimate: ~$0.10–0.20 per plan with a photo, mostly output and thinking tokens. These are estimates, not measurements. In priority order:

1. **Measure first.** Log `usage` (input, output, cache read and write tokens) per AI call and per feature, and record estimated cost. This is part of the AIRequests / AIUsage tables in the full spec.
2. **Effort sweep.** Photo analysis at `low`, garden design at `low` vs `medium`. Compare quality on ~20 saved sample inputs before switching.
3. **Skip AI when it adds little.** Use the free rule-based designer when there's no photo and no free-text request; call the AI for "help me choose", typed notes and photos.
4. **Smaller design prompt.** Send compact attributes for only the plants that work this season instead of the full catalog. At low traffic the cache rarely hits, so fewer input tokens beats caching.
5. **Shorter outputs.** One-sentence reasons, three tips max; let the engine template the routine text.
6. **Smaller photos.** Downscale to 1024 px on the long edge (~1K image tokens instead of ~2.5K), after checking estimates don't get worse.
7. **Reuse results.** Cache designs by a hash of the inputs; never re-analyze the same photo.
8. **Model choice last.** Try Claude Sonnet 5.5 or Haiku 4.5 for photo analysis and Ask Plantr only after the steps above, and only if quality holds on the sample set.
9. **Backstops.** Per-user daily quotas (photos, diagnoses, questions) and a monthly spend limit in the Claude Console.

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
- Garden types: grow bags, balcony, patio, window box (plus indoor, above).
- Space-capacity explanations ("room for about 12–16 plants") and optimized trade-offs when the wishlist doesn't fit.
- Companion-planting advice with confidence levels, without folklore presented as fact.
- Fuller data model: GardenPhotos, GardenAreas, GardenPlants, GardenLayouts, GardenTasks, GardenEvents, PlantDiagnoses, ShoppingLists, ShoppingListItems, AIRequests, AIUsage.
- AI provider abstraction, analytics events and funnel tracking, feature flags (e.g. disable My Garden), and free vs premium limits.
- Landing page copy and the "See an Example" path from the spec.
- Plant data additions: scientific names, USDA zone ranges, heat tolerance, row spacing, soil preferences.
