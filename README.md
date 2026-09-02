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

GitHub Pages only serves static files — no server — so this is a static site
that reads a checked-in `public/menu-data.json` snapshot instead of scraping
per-request:

- **Data source**: `src/lib/scrape.ts` fetches and parses the HTML at
  `dining.umich.edu/menus-locations/dining-halls/<hall>/`, which M|Dining
  server-renders with the full day's menu, nutrition facts, allergen tags,
  and dietary trait tags per item. There's no JSON API for this — the
  filtering UI on the live site is just client-side CSS class toggling on
  server-rendered `<li>` elements, so this scrapes that same markup.
- **Refreshing the data — manual, on purpose**: `dining.umich.edu` sits
  behind Cloudflare, which blocks requests from known cloud/CI IP ranges
  (confirmed for both GitHub Actions and Vercel Functions — both get a 403
  with a Cloudflare bot-management response). A direct fetch from a visitor's
  own browser doesn't work either, since the site sends no
  `Access-Control-Allow-Origin` header, so the browser blocks the
  cross-origin read regardless. That rules out both "scrape on a schedule
  from CI" and "fetch live when the page loads." Rather than try to spoof
  past Cloudflare's bot protection, `public/menu-data.json` is just
  **committed to the repo** and refreshed by running
  `npm run fetch-menus` from somewhere that isn't a flagged cloud IP (e.g.
  a laptop, or this Claude Code sandbox) and pushing the result. `git blame`
  / `git log -- public/menu-data.json` shows how fresh it currently is.
- **Deploy**: `.github/workflows/deploy.yml` runs on every push to `main` —
  it just builds whatever `menu-data.json` is currently checked in and
  deploys the static output to GitHub Pages. It does not re-scrape (CI would
  hit the same Cloudflare block).
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

- **Data freshness**: menu data is only as fresh as the last manual
  `npm run fetch-menus` + push (see above for why this can't be automated).
  Check `public/menu-data.json`'s `generatedAt` field, shown in the app's UI,
  before trusting a plan for a meal you're about to eat.
- **Allergen safety**: filtering is based on M|Dining's own posted allergen
  tags at the time of the last refresh. This is a planning aid, not a
  substitute for checking the posted allergen signage or MyNutrition in the
  dining hall itself, especially for a serious allergy — cross-contact and
  last-minute recipe changes aren't reflected in the menu data.
- **"Today" only**: M|Dining's pages don't expose a way to query a different
  date — they always render the current day's menu, so a refresh always
  captures "today" as of when it was run.
- If your filters (especially stacking a diet preference with several
  excluded allergens) leave very few real menu items, the app will fall
  short of your targets and surface a warning explaining why, rather than
  silently returning an incomplete plan.

## Deployment

Handled by `.github/workflows/deploy.yml` via GitHub Actions + GitHub Pages
(Pages source set to "GitHub Actions" in repo settings) — triggers on every
push to `main`. To publish fresher menu data: run `npm run fetch-menus`
locally, commit `public/menu-data.json`, and push.
