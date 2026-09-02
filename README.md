# M|Dining Bulk Planner

Sets a daily calorie/macro target from three sliders (protein/carb/fat), then
builds a same-day meal plan from University of Michigan dining hall menus,
filtered by the dining halls you'll visit, allergens to avoid, and
(optionally) a diet preference (vegan/vegetarian/halal/kosher/gluten-free).

Deployed at **https://joeybrar.github.io**.

## Run it locally

```bash
npm install
npm run fetch-menus   # scrapes today's menus into public/menu-data.json
npm run dev
```

Open http://localhost:3000. Re-run `npm run fetch-menus` whenever you want
fresher data locally (the dev server doesn't re-fetch on its own).

## How it works

GitHub Pages only serves static files — it can't run a server — so this is
architected as a static site plus a periodically-refreshed data snapshot
instead of scraping on every request:

- **Data source**: `src/lib/scrape.ts` fetches and parses the HTML at
  `dining.umich.edu/menus-locations/dining-halls/<hall>/`, which M|Dining
  server-renders with the full day's menu, nutrition facts, allergen tags,
  and dietary trait tags per item. There's no JSON API for this — the
  filtering UI on the live site is just client-side CSS class toggling on
  server-rendered `<li>` elements, so this scrapes that same markup.
- **Scheduled refresh**: `scripts/fetch-menus.ts` runs this scraper for all 8
  dining halls and writes the combined result to `public/menu-data.json`.
  `.github/workflows/deploy.yml` runs that script every 2 hours (and on every
  push to `main`), then does a static `next build` and deploys the result to
  GitHub Pages — so `menu-data.json` is never more than ~2 hours stale.
  `menu-data.json` is gitignored; it's a build artifact, not source.
- **Meal plan solver**: `src/lib/planner.ts` is a pure, synchronous function
  that runs entirely in the browser against the fetched `menu-data.json`. It
  splits your daily targets evenly across the number of meals you pick,
  spreads those meals across the meal periods (Breakfast/Lunch/Dinner/etc.)
  actually available at your selected halls today, then for each meal slot
  runs a bounded greedy + local-search algorithm per hall to find a small
  combo of items that lands close to that meal's calorie/protein/carb/fat
  target, and picks whichever hall fits best. It nudges away from repeating
  the exact same item across meals for variety.
- **"Naturalness" score**: M|Dining does **not** publish per-item ingredient
  lists — only nutrition facts, allergens, and a few tags (including an
  MHealthy 1-5 nutrient-density tier). `src/lib/naturalness.ts` builds a 0-100
  heuristic from that tier, whether the item is deep-fried, and its
  sugar/sodium density per calorie. It's a reasonable proxy for "minimally
  processed," not a literal ingredient audit.

## Important caveats

- **Allergen safety**: filtering is based on M|Dining's own posted allergen
  tags, refreshed every 2 hours. This is a planning aid, not a substitute for
  checking the posted allergen signage or MyNutrition in the dining hall
  itself, especially for a serious allergy — cross-contact and last-minute
  recipe changes aren't reflected in the menu data.
- **"Today" only**: M|Dining's pages don't expose a way to query a different
  date — they always render the current day's menu, so this app always plans
  for today.
- If your filters (especially stacking a diet preference with several
  excluded allergens) leave very few real menu items, the app will fall
  short of your targets and surface a warning explaining why, rather than
  silently returning an incomplete plan.

## Deployment

Handled by `.github/workflows/deploy.yml` via GitHub Actions + GitHub Pages
(Pages source set to "GitHub Actions" in repo settings). No manual deploy
steps — push to `main` or wait for the next scheduled run.
