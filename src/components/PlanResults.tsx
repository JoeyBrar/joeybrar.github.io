import { DayPlan, MealPlan } from "@/lib/types";

function round(n: number): number {
  return Math.round(n);
}

function MacroBar({
  label,
  actual,
  target,
  unit,
  colorClass,
}: {
  label: string;
  actual: number;
  target: number;
  unit: string;
  colorClass: string;
}) {
  const pct = target > 0 ? Math.min(150, (actual / target) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-gray-500 dark:text-gray-400">
          {round(actual)} / {round(target)}
          {unit}
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function naturalnessColor(score: number): string {
  if (score >= 70) return "text-green-600 dark:text-green-400";
  if (score >= 45) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-500 dark:text-red-400";
}

function MealCard({
  meal,
  onRegenerate,
}: {
  meal: MealPlan;
  onRegenerate: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
        <div>
          <span className="text-xs uppercase tracking-wide text-gray-500">
            Meal {meal.index} &middot; {meal.period}
          </span>
          <h3 className="text-lg font-semibold">
            {meal.hallName ?? "No hall available"}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {meal.picks.length > 0 && (
            <span
              className={`text-sm font-medium ${naturalnessColor(
                meal.avgNaturalness
              )}`}
            >
              Naturalness {meal.avgNaturalness}/100
            </span>
          )}
          <button
            onClick={onRegenerate}
            className="text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
            title="Don't like this meal? Try a different combo."
          >
            ↻ Try again
          </button>
        </div>
      </div>

      {meal.unresolved ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {meal.unresolved}
        </p>
      ) : (
        <>
          <ul className="space-y-2 mb-3">
            {meal.picks.map((p) => (
              <li
                key={p.item.id}
                className="flex justify-between gap-3 text-sm border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0"
              >
                <div>
                  <div className="font-medium">
                    {p.qty > 1 ? `${p.qty}× ` : ""}
                    {p.item.name}
                  </div>
                  <div className="text-gray-500 dark:text-gray-400 text-xs">
                    {p.item.station} &middot; {p.item.nutrition.servingSize || "1 serving"}
                    {p.item.allergens.length > 0 && (
                      <> &middot; contains {p.item.allergens.join(", ")}</>
                    )}
                  </div>
                </div>
                <div className="text-right whitespace-nowrap text-gray-600 dark:text-gray-300">
                  {round(p.item.nutrition.calories * p.qty)} kcal
                  <div className="text-xs text-gray-400">
                    P{round(p.item.nutrition.proteinG * p.qty)} / C
                    {round(p.item.nutrition.totalCarbG * p.qty)} / F
                    {round(p.item.nutrition.totalFatG * p.qty)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-4 gap-2 text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-2">
            <div>
              <div className="text-gray-400">Calories</div>
              <div className="font-medium">
                {round(meal.totals.calories)} / {round(meal.target.calories)}
              </div>
            </div>
            <div>
              <div className="text-gray-400">Protein</div>
              <div className="font-medium">
                {round(meal.totals.proteinG)}g / {round(meal.target.proteinG)}g
              </div>
            </div>
            <div>
              <div className="text-gray-400">Carbs</div>
              <div className="font-medium">
                {round(meal.totals.carbG)}g / {round(meal.target.carbG)}g
              </div>
            </div>
            <div>
              <div className="text-gray-400">Fat</div>
              <div className="font-medium">
                {round(meal.totals.fatG)}g / {round(meal.target.fatG)}g
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function PlanResults({
  plan,
  onRegenerateMeal,
}: {
  plan: DayPlan;
  onRegenerateMeal: (mealIndex: number) => void;
}) {
  return (
    <div className="space-y-6">
      {plan.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
          {plan.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
        <h2 className="font-semibold mb-1">Day totals vs. target</h2>
        <MacroBar
          label="Calories"
          actual={plan.dayTotals.calories}
          target={plan.dayTarget.calories}
          unit=" kcal"
          colorClass="bg-gray-800 dark:bg-gray-200"
        />
        <MacroBar
          label="Protein"
          actual={plan.dayTotals.proteinG}
          target={plan.dayTarget.proteinG}
          unit="g"
          colorClass="bg-blue-500"
        />
        <MacroBar
          label="Carbs"
          actual={plan.dayTotals.carbG}
          target={plan.dayTarget.carbG}
          unit="g"
          colorClass="bg-amber-500"
        />
        <MacroBar
          label="Fat"
          actual={plan.dayTotals.fatG}
          target={plan.dayTarget.fatG}
          unit="g"
          colorClass="bg-rose-500"
        />
      </div>

      <div className="space-y-4">
        {plan.meals.map((meal) => (
          <MealCard
            key={meal.index}
            meal={meal}
            onRegenerate={() => onRegenerateMeal(meal.index)}
          />
        ))}
      </div>
    </div>
  );
}
