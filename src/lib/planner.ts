import {
  DINING_HALLS,
  DayPlan,
  MEAL_PERIODS,
  MealItemPick,
  MealPlan,
  MenuItem,
  PlanRequest,
  caloriesFromMacros,
} from "./types";

interface Target {
  calories: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

const ZERO_TARGET: Target = { calories: 0, proteinG: 0, carbG: 0, fatG: 0 };

const MAX_TOTAL_UNITS = 16;
const MAX_QTY_PER_ITEM = 3;
const MAX_DISTINCT_ITEMS = 7;
const REPEAT_PENALTY = 0.05;
const NATURALNESS_WEIGHT = 0.00004; // scaled per-unit by that item's calorie contribution
const HALL_NATURALNESS_WEIGHT = 0.0025;

function weightedError(s: Target, t: Target): number {
  const wc = 1 / Math.max(t.calories, 1);
  const wp = 1 / Math.max(t.proteinG, 1);
  const wcarb = 1 / Math.max(t.carbG, 1);
  const wf = 1 / Math.max(t.fatG, 1);
  return (
    wc * wc * (s.calories - t.calories) ** 2 +
    wp * wp * (s.proteinG - t.proteinG) ** 2 +
    wcarb * wcarb * (s.carbG - t.carbG) ** 2 +
    wf * wf * (s.fatG - t.fatG) ** 2
  );
}

function unitVector(item: MenuItem): Target {
  return {
    calories: item.nutrition.calories,
    proteinG: item.nutrition.proteinG,
    carbG: item.nutrition.totalCarbG,
    fatG: item.nutrition.totalFatG,
  };
}

function addVec(a: Target, b: Target, qty = 1): Target {
  return {
    calories: a.calories + b.calories * qty,
    proteinG: a.proteinG + b.proteinG * qty,
    carbG: a.carbG + b.carbG * qty,
    fatG: a.fatG + b.fatG * qty,
  };
}

/** Bounded greedy + local-search solver: picks a small combo of items from
 *  `items` whose summed macros land close to `target`, using naturalness
 *  score as a tiebreaker. Not a true optimizer, but converges well for the
 *  small (dozens of items) candidate pools a single dining-hall meal period has. */
function solveMeal(
  items: MenuItem[],
  target: Target,
  usedItemIds: Set<string> = new Set()
): { picks: MealItemPick[]; totals: Target } {
  if (items.length === 0) {
    return { picks: [], totals: ZERO_TARGET };
  }

  const qty = new Map<string, number>();
  let totals: Target = ZERO_TARGET;
  let totalUnits = 0;

  for (let step = 0; step < MAX_TOTAL_UNITS; step++) {
    const distinctCount = qty.size;
    let bestItem: MenuItem | null = null;
    let bestError = Infinity;
    let bestTotals: Target = totals;

    for (const item of items) {
      const currentQty = qty.get(item.id) ?? 0;
      if (currentQty >= MAX_QTY_PER_ITEM) continue;
      if (currentQty === 0 && distinctCount >= MAX_DISTINCT_ITEMS) continue;

      const candidateTotals = addVec(totals, unitVector(item));
      const naturalnessBonus =
        NATURALNESS_WEIGHT * item.naturalness * item.nutrition.calories;
      const repeatPenalty =
        currentQty === 0 && usedItemIds.has(item.id) ? REPEAT_PENALTY : 0;
      const err =
        weightedError(candidateTotals, target) - naturalnessBonus + repeatPenalty;

      if (err < bestError) {
        bestError = err;
        bestItem = item;
        bestTotals = candidateTotals;
      }
    }

    if (!bestItem) break;

    const currentErr = weightedError(totals, target);
    // stop once calories AND protein are both close to target and adding more wouldn't help
    const calRatio = totals.calories / Math.max(target.calories, 1);
    const proteinRatio = totals.proteinG / Math.max(target.proteinG, 1);
    if (calRatio >= 0.95 && proteinRatio >= 0.9 && bestError >= currentErr) break;

    qty.set(bestItem.id, (qty.get(bestItem.id) ?? 0) + 1);
    totals = bestTotals;
    totalUnits++;
    if (totalUnits >= MAX_TOTAL_UNITS) break;
  }

  // local search: try removing each unit, keep removal if it improves error
  let improved = true;
  let guard = 0;
  while (improved && guard < 20) {
    improved = false;
    guard++;
    for (const [id, q] of Array.from(qty.entries())) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      const withoutTotals = addVec(totals, unitVector(item), -1);
      if (weightedError(withoutTotals, target) < weightedError(totals, target)) {
        totals = withoutTotals;
        if (q - 1 <= 0) qty.delete(id);
        else qty.set(id, q - 1);
        improved = true;
      }
    }
  }

  const picks: MealItemPick[] = Array.from(qty.entries())
    .map(([id, q]) => ({ item: items.find((i) => i.id === id)!, qty: q }))
    .filter((p) => p.item)
    .sort((a, b) => b.item.nutrition.calories - a.item.nutrition.calories);

  return { picks, totals };
}

function avgNaturalnessOf(picks: MealItemPick[]): number {
  const totalQty = picks.reduce((s, p) => s + p.qty, 0);
  if (totalQty === 0) return 0;
  return (
    picks.reduce((s, p) => s + p.item.naturalness * p.qty, 0) / totalQty
  );
}

function filterItems(
  allItems: MenuItem[],
  excludedAllergens: string[],
  requiredDiets: string[]
): MenuItem[] {
  const excluded = new Set(excludedAllergens);
  return allItems.filter((item) => {
    if (item.allergens.some((a) => excluded.has(a))) return false;
    if (requiredDiets.length > 0) {
      return requiredDiets.every((d) => item.traits.includes(d));
    }
    return true;
  });
}

interface HallCandidate {
  hallSlug: string;
  hallName: string;
  items: MenuItem[];
}

/** Tries every candidate hall for this meal's period and keeps whichever
 *  produces the best macro fit (naturalness as a secondary tiebreak). */
function pickBestHallMeal(
  candidates: HallCandidate[],
  period: string,
  target: Target,
  usedItemIds: Set<string>
): {
  hallSlug: string;
  hallName: string;
  picks: MealItemPick[];
  totals: Target;
} | null {
  let best: {
    hallSlug: string;
    hallName: string;
    picks: MealItemPick[];
    totals: Target;
    score: number;
  } | null = null;

  for (const { hallSlug, hallName, items } of candidates) {
    const periodItems = items.filter((i) => i.mealPeriod === period);
    if (periodItems.length === 0) continue;

    const { picks, totals } = solveMeal(periodItems, target, usedItemIds);
    if (picks.length === 0) continue;

    const score =
      weightedError(totals, target) -
      HALL_NATURALNESS_WEIGHT * avgNaturalnessOf(picks);

    if (!best || score < best.score) {
      best = { hallSlug, hallName, picks, totals, score };
    }
  }

  return best;
}

function hallCandidatesFor(
  filteredItems: MenuItem[],
  hallSlugs: string[]
): HallCandidate[] {
  return hallSlugs
    .map((slug) => DINING_HALLS.find((h) => h.slug === slug))
    .filter((h): h is (typeof DINING_HALLS)[number] => !!h)
    .map((hall) => ({
      hallSlug: hall.slug,
      hallName: hall.name,
      items: filteredItems.filter((i) => i.hallSlug === hall.slug),
    }));
}

/**
 * Pure, synchronous planner: takes the full pre-fetched menu item list
 * (all halls, generated offline by scripts/fetch-menus.ts and shipped as a
 * static JSON file) and a plan request, and builds a day plan. No network
 * access here, so this is safe to run entirely in the browser.
 */
export function buildDayPlan(allItems: MenuItem[], req: PlanRequest): DayPlan {
  const warnings: string[] = [];
  const dayTarget = {
    calories: caloriesFromMacros(req),
    proteinG: req.proteinG,
    carbG: req.carbG,
    fatG: req.fatG,
  };

  const filteredItems = filterItems(
    allItems,
    req.excludedAllergens,
    req.requiredDiets
  );

  // Expand each period's count into individual meal slots, in canonical
  // Breakfast -> Lunch -> Dinner order regardless of the request's array order.
  const slots = MEAL_PERIODS.flatMap((period) => {
    const config = req.periods.find((p) => p.period === period);
    if (!config || config.count <= 0 || config.hallSlugs.length === 0) {
      return [];
    }
    return Array.from({ length: config.count }, () => ({
      period,
      hallSlugs: config.hallSlugs,
    }));
  });

  const totalMeals = slots.length;

  if (totalMeals === 0) {
    warnings.push(
      "No meals configured — assign at least one dining hall to a meal period."
    );
    return { meals: [], dayTarget, dayTotals: ZERO_TARGET, warnings };
  }

  const perMealTarget: Target = {
    calories: dayTarget.calories / totalMeals,
    proteinG: dayTarget.proteinG / totalMeals,
    carbG: dayTarget.carbG / totalMeals,
    fatG: dayTarget.fatG / totalMeals,
  };

  const usedItemIds = new Set<string>();

  const meals: MealPlan[] = slots.map((slot, idx) => {
    const candidates = hallCandidatesFor(filteredItems, slot.hallSlugs);
    const best = pickBestHallMeal(
      candidates,
      slot.period,
      perMealTarget,
      usedItemIds
    );

    if (!best) {
      return {
        index: idx + 1,
        period: slot.period,
        hallSlug: null,
        hallName: null,
        picks: [],
        totals: ZERO_TARGET,
        target: perMealTarget,
        avgNaturalness: 0,
        unresolved: `No ${slot.period} items available at your assigned hall(s) right now.`,
      };
    }

    best.picks.forEach((p) => usedItemIds.add(p.item.id));

    return {
      index: idx + 1,
      period: slot.period,
      hallSlug: best.hallSlug,
      hallName: best.hallName,
      picks: best.picks,
      totals: best.totals,
      target: perMealTarget,
      avgNaturalness: Math.round(avgNaturalnessOf(best.picks)),
    };
  });

  const dayTotals = sumMealTotals(meals);
  warnings.push(...shortfallWarnings(dayTarget, dayTotals));

  return { meals, dayTarget, dayTotals, warnings };
}

export function sumMealTotals(meals: MealPlan[]): Target {
  return meals.reduce((acc, m) => addVec(acc, m.totals), ZERO_TARGET);
}

export function shortfallWarnings(dayTarget: Target, dayTotals: Target): string[] {
  const calorieRatio = dayTotals.calories / Math.max(dayTarget.calories, 1);
  const proteinRatio = dayTotals.proteinG / Math.max(dayTarget.proteinG, 1);
  if (calorieRatio < 0.75 || proteinRatio < 0.75) {
    return [
      `Your dining hall + allergen/diet filters left pretty limited real options today, so this plan only reaches ~${Math.round(
        calorieRatio * 100
      )}% of your calorie target and ~${Math.round(
        proteinRatio * 100
      )}% of your protein target. Try adding another dining hall or relaxing a filter.`,
    ];
  }
  return [];
}

/**
 * Re-solves a single meal, preferring items that weren't in its previous
 * picks (hard exclusion first; falls back to the softer repeat-penalty if
 * excluding entirely leaves no viable combo for that hall selection).
 */
export function regenerateMeal(
  allItems: MenuItem[],
  req: PlanRequest,
  meal: MealPlan
): MealPlan {
  const filteredItems = filterItems(
    allItems,
    req.excludedAllergens,
    req.requiredDiets
  );

  const config = req.periods.find((p) => p.period === meal.period);
  const hallSlugs = config?.hallSlugs ?? [];
  const candidates = hallCandidatesFor(filteredItems, hallSlugs);

  const previousIds = new Set(meal.picks.map((p) => p.item.id));

  const excludedCandidates: HallCandidate[] = candidates.map((c) => ({
    ...c,
    items: c.items.filter((i) => !previousIds.has(i.id)),
  }));

  let best = pickBestHallMeal(
    excludedCandidates,
    meal.period,
    meal.target,
    new Set()
  );

  // If hard exclusion leaves nothing viable (e.g. only one item fits at that
  // hall), fall back to allowing repeats but still nudging away from them.
  if (!best) {
    best = pickBestHallMeal(candidates, meal.period, meal.target, previousIds);
  }

  if (!best) {
    return {
      ...meal,
      unresolved: `No other ${meal.period} items available at your assigned hall(s) right now.`,
    };
  }

  return {
    ...meal,
    hallSlug: best.hallSlug,
    hallName: best.hallName,
    picks: best.picks,
    totals: best.totals,
    avgNaturalness: Math.round(avgNaturalnessOf(best.picks)),
    unresolved: undefined,
  };
}
