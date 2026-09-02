import {
  DINING_HALLS,
  DayPlan,
  MealItemPick,
  MealPlan,
  MenuItem,
  PlanRequest,
  caloriesFromMacros,
} from "./types";

const PERIOD_ORDER = ["Breakfast", "Brunch", "Lunch", "Dinner", "Late Night"];
const PERIOD_WEIGHT: Record<string, number> = {
  Breakfast: 1,
  Brunch: 1,
  Lunch: 1.25,
  Dinner: 1.25,
  "Late Night": 0.8,
};

function periodSortKey(period: string): number {
  const idx = PERIOD_ORDER.indexOf(period);
  return idx === -1 ? PERIOD_ORDER.length : idx;
}

/** Spreads `mealsPerDay` slots across the periods actually available today,
 *  weighting lunch/dinner slightly heavier, using largest-remainder rounding. */
function distributeMeals(periods: string[], mealsPerDay: number): string[] {
  if (periods.length === 0) return [];
  const sorted = [...periods].sort(
    (a, b) => periodSortKey(a) - periodSortKey(b)
  );
  const weights = sorted.map((p) => PERIOD_WEIGHT[p] ?? 1);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const raw = weights.map((w) => (w / weightSum) * mealsPerDay);
  const base = raw.map(Math.floor);
  let remaining = mealsPerDay - base.reduce((a, b) => a + b, 0);

  const remainders = raw
    .map((r, i) => ({ i, frac: r - base[i] }))
    .sort((a, b) => b.frac - a.frac);

  for (let k = 0; k < remainders.length && remaining > 0; k++) {
    base[remainders[k].i] += 1;
    remaining--;
  }
  // if still remaining (mealsPerDay > sum because of rounding edge cases), dump into last period
  let i = 0;
  while (remaining > 0) {
    base[i % base.length] += 1;
    remaining--;
    i++;
  }

  const slots: string[] = [];
  sorted.forEach((p, idx) => {
    for (let c = 0; c < base[idx]; c++) slots.push(p);
  });
  // ensure exactly mealsPerDay slots even if a period had 0 weight rounding issue
  while (slots.length < mealsPerDay) slots.push(sorted[sorted.length - 1]);
  return slots.slice(0, mealsPerDay);
}

interface Target {
  calories: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

const MAX_TOTAL_UNITS = 16;
const MAX_QTY_PER_ITEM = 3;
const MAX_DISTINCT_ITEMS = 7;
const REPEAT_PENALTY = 0.05;

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
    return { picks: [], totals: { calories: 0, proteinG: 0, carbG: 0, fatG: 0 } };
  }

  const qty = new Map<string, number>();
  let totals: Target = { calories: 0, proteinG: 0, carbG: 0, fatG: 0 };
  let totalUnits = 0;

  const NATURALNESS_WEIGHT = 0.00004; // scaled per-unit by that item's calorie contribution

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

  const hallEntries = req.hallSlugs
    .map((slug) => DINING_HALLS.find((h) => h.slug === slug))
    .filter((h): h is (typeof DINING_HALLS)[number] => !!h);

  const hallItems = hallEntries.map((h) => ({
    hall: h,
    items: allItems.filter((i) => i.hallSlug === h.slug),
  }));

  const excluded = new Set(req.excludedAllergens);
  const requiredDiets = req.requiredDiets;

  const filteredByHall = hallItems.map(({ hall, items }) => ({
    hall,
    items: items.filter((item) => {
      if (item.allergens.some((a) => excluded.has(a))) return false;
      if (requiredDiets.length > 0) {
        return requiredDiets.every((d) => item.traits.includes(d));
      }
      return true;
    }),
  }));

  const availablePeriods = Array.from(
    new Set(filteredByHall.flatMap(({ items }) => items.map((i) => i.mealPeriod)))
  );

  if (availablePeriods.length === 0) {
    warnings.push(
      "No menu items matched your dining hall + allergen/diet filters right now."
    );
    return {
      meals: [],
      dayTarget,
      dayTotals: { calories: 0, proteinG: 0, carbG: 0, fatG: 0 },
      warnings,
    };
  }

  const slots = distributeMeals(availablePeriods, req.mealsPerDay);

  const perMealTarget: Target = {
    calories: dayTarget.calories / req.mealsPerDay,
    proteinG: dayTarget.proteinG / req.mealsPerDay,
    carbG: dayTarget.carbG / req.mealsPerDay,
    fatG: dayTarget.fatG / req.mealsPerDay,
  };

  const usedItemIds = new Set<string>();

  const meals: MealPlan[] = slots.map((period, idx) => {
    let best: {
      hall: (typeof DINING_HALLS)[number];
      picks: MealItemPick[];
      totals: Target;
      score: number;
    } | null = null;

    for (const { hall, items } of filteredByHall) {
      const periodItems = items.filter((i) => i.mealPeriod === period);
      if (periodItems.length === 0) continue;

      const { picks, totals } = solveMeal(
        periodItems,
        perMealTarget,
        usedItemIds
      );
      if (picks.length === 0) continue;

      const avgNaturalness =
        picks.reduce((sum, p) => sum + p.item.naturalness * p.qty, 0) /
        Math.max(
          picks.reduce((sum, p) => sum + p.qty, 0),
          1
        );
      const score =
        weightedError(totals, perMealTarget) - 0.0025 * avgNaturalness;

      if (!best || score < best.score) {
        best = { hall, picks, totals, score };
      }
    }

    if (!best) {
      return {
        index: idx + 1,
        period,
        hallSlug: null,
        hallName: null,
        picks: [],
        totals: { calories: 0, proteinG: 0, carbG: 0, fatG: 0 },
        target: perMealTarget,
        avgNaturalness: 0,
        unresolved: `No ${period} items available at your selected halls right now.`,
      };
    }

    const totalQty = best.picks.reduce((s, p) => s + p.qty, 0);
    const avgNaturalness =
      best.picks.reduce((s, p) => s + p.item.naturalness * p.qty, 0) /
      Math.max(totalQty, 1);

    best.picks.forEach((p) => usedItemIds.add(p.item.id));

    return {
      index: idx + 1,
      period,
      hallSlug: best.hall.slug,
      hallName: best.hall.name,
      picks: best.picks,
      totals: best.totals,
      target: perMealTarget,
      avgNaturalness: Math.round(avgNaturalness),
    };
  });

  const dayTotals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.totals.calories,
      proteinG: acc.proteinG + m.totals.proteinG,
      carbG: acc.carbG + m.totals.carbG,
      fatG: acc.fatG + m.totals.fatG,
    }),
    { calories: 0, proteinG: 0, carbG: 0, fatG: 0 }
  );

  const calorieRatio = dayTotals.calories / Math.max(dayTarget.calories, 1);
  const proteinRatio = dayTotals.proteinG / Math.max(dayTarget.proteinG, 1);
  if (calorieRatio < 0.75 || proteinRatio < 0.75) {
    warnings.push(
      `Your dining hall + allergen/diet filters left pretty limited real options today, so this plan only reaches ~${Math.round(
        calorieRatio * 100
      )}% of your calorie target and ~${Math.round(
        proteinRatio * 100
      )}% of your protein target. Try adding another dining hall or relaxing a filter.`
    );
  }

  return { meals, dayTarget, dayTotals, warnings };
}
