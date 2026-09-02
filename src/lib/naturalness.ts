import { MenuItem } from "./types";

/**
 * M|Dining does not publish per-item ingredient lists (only nutrition facts,
 * allergens, and a few dietary tags), so we can't score literal ingredients.
 * Instead this approximates "how natural / minimally processed" an item is
 * using signals M|Dining *does* publish:
 *  - MHealthy nutrient-density tier (1-5, an M|Dining-assigned rating)
 *  - whether the item is deep-fried
 *  - sugar and sodium density relative to calories (highly processed foods
 *    tend to be sugar- or sodium-dense per calorie; whole foods less so)
 *  - fiber content (whole/less-processed foods tend to retain fiber)
 * Score is 0-100, purely a ranking heuristic to break ties between items
 * that otherwise fit the macro targets equally well.
 */
export function naturalnessScore(item: MenuItem): number {
  let score = 50;

  if (item.mhealthyTier != null) {
    score += (item.mhealthyTier - 3) * 12;
  }

  if (item.isDeepFried) score -= 20;

  const cals = item.nutrition.calories || 0;
  if (cals > 0) {
    const sugarCalRatio = (item.nutrition.sugarG * 4) / cals;
    const sodiumDensity = item.nutrition.sodiumMg / cals;

    if (sugarCalRatio > 0.35) score -= 15;
    else if (sugarCalRatio > 0.2) score -= 7;

    if (sodiumDensity > 3) score -= 15;
    else if (sodiumDensity > 1.8) score -= 7;

    if (item.nutrition.fiberG >= 3) score += 8;
  }

  if (item.traits.includes("vegan") || item.traits.includes("vegetarian")) {
    score += 4;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
