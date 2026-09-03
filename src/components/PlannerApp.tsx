"use client";

import { useMemo, useState, useEffect } from "react";
import { buildDayPlan, regenerateMeal, sumMealTotals, shortfallWarnings } from "@/lib/planner";
import {
  ALLERGEN_OPTIONS,
  DayPlan,
  DIET_OPTIONS,
  DINING_HALLS,
  MEAL_PERIODS,
  MealPeriodName,
  MenuItem,
  PlanRequest,
  caloriesFromMacros,
} from "@/lib/types";
import PlanResults from "./PlanResults";

interface MenuDataFile {
  generatedAt: string;
  items: MenuItem[];
  errors: string[];
}

interface PeriodState {
  count: number;
  hallSlugs: Set<string>;
}

const DEFAULT_PROTEIN = 190;
const DEFAULT_CARB = 450;
const DEFAULT_FAT = 90;
const DEFAULT_HALL = "wolverine-village-dining-hall";

function defaultPeriodState(): Record<MealPeriodName, PeriodState> {
  return {
    Breakfast: { count: 1, hallSlugs: new Set([DEFAULT_HALL]) },
    Lunch: { count: 1, hallSlugs: new Set([DEFAULT_HALL]) },
    Dinner: { count: 1, hallSlugs: new Set([DEFAULT_HALL]) },
  };
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  colorClass,
  kcalPerGram,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  colorClass: string;
  kcalPerGram: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <label className="font-medium text-sm">{label}</label>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {value}g &middot; {Math.round(value * kcalPerGram)} kcal
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full accent-current ${colorClass}`}
      />
    </div>
  );
}

function CheckboxGrid({
  options,
  selected,
  onToggle,
  columns = 2,
}: {
  options: { key: string; label: string }[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  columns?: number;
}) {
  return (
    <div
      className={`grid gap-2 ${
        columns === 2 ? "grid-cols-2" : "grid-cols-1"
      }`}
    >
      {options.map((opt) => (
        <label
          key={opt.key}
          className="flex items-center gap-2 text-sm rounded-lg border border-gray-200 dark:border-gray-800 px-2.5 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
        >
          <input
            type="checkbox"
            checked={selected.has(opt.key)}
            onChange={() => onToggle(opt.key)}
            className="accent-gray-800 dark:accent-gray-200"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

function PeriodCard({
  period,
  state,
  onCountChange,
  onToggleHall,
}: {
  period: MealPeriodName;
  state: PeriodState;
  onCountChange: (n: number) => void;
  onToggleHall: (hallSlug: string) => void;
}) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{period}</h2>
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => onCountChange(n)}
              className={`w-8 h-8 rounded-lg text-sm border ${
                state.count === n
                  ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900"
                  : "border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      {state.count > 0 && (
        <>
          <CheckboxGrid
            options={DINING_HALLS.map((h) => ({ key: h.slug, label: h.name }))}
            selected={state.hallSlugs}
            onToggle={onToggleHall}
          />
          {state.hallSlugs.size === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Pick at least one hall for {period}, or set the count back to 0.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default function PlannerApp() {
  const [proteinG, setProteinG] = useState(DEFAULT_PROTEIN);
  const [carbG, setCarbG] = useState(DEFAULT_CARB);
  const [fatG, setFatG] = useState(DEFAULT_FAT);
  const [periodState, setPeriodState] = useState(defaultPeriodState);
  const [excludedAllergens, setExcludedAllergens] = useState<Set<string>>(
    new Set()
  );
  const [requiredDiets, setRequiredDiets] = useState<Set<string>>(new Set());

  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [lastReq, setLastReq] = useState<PlanRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [menuData, setMenuData] = useState<MenuDataFile | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/menu-data.json", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: MenuDataFile) => {
        if (!cancelled) setMenuData(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setDataError(
            e instanceof Error
              ? `Couldn't load today's menu data: ${e.message}`
              : "Couldn't load today's menu data."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalCalories = useMemo(
    () => caloriesFromMacros({ proteinG, carbG, fatG }),
    [proteinG, carbG, fatG]
  );

  const totalMeals = useMemo(
    () => MEAL_PERIODS.reduce((sum, p) => sum + periodState[p].count, 0),
    [periodState]
  );

  function toggleFromSet(
    set: Set<string>,
    setSet: (s: Set<string>) => void,
    key: string
  ) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSet(next);
  }

  function setPeriodCount(period: MealPeriodName, count: number) {
    setPeriodState((prev) => ({ ...prev, [period]: { ...prev[period], count } }));
  }

  function toggleHallForPeriod(period: MealPeriodName, hallSlug: string) {
    setPeriodState((prev) => {
      const next = new Set(prev[period].hallSlugs);
      if (next.has(hallSlug)) next.delete(hallSlug);
      else next.add(hallSlug);
      return { ...prev, [period]: { ...prev[period], hallSlugs: next } };
    });
  }

  function generatePlan() {
    setError(null);
    if (!menuData) {
      setError("Menu data isn't loaded yet.");
      return;
    }
    const req: PlanRequest = {
      proteinG,
      carbG,
      fatG,
      periods: MEAL_PERIODS.map((period) => ({
        period,
        count: periodState[period].count,
        hallSlugs: Array.from(periodState[period].hallSlugs),
      })),
      excludedAllergens: Array.from(excludedAllergens),
      requiredDiets: Array.from(requiredDiets),
    };
    setLastReq(req);
    setPlan(buildDayPlan(menuData.items, req));
  }

  function handleRegenerateMeal(mealIndex: number) {
    if (!menuData || !plan || !lastReq) return;
    const meal = plan.meals.find((m) => m.index === mealIndex);
    if (!meal) return;
    const updatedMeal = regenerateMeal(menuData.items, lastReq, meal);
    const meals = plan.meals.map((m) =>
      m.index === mealIndex ? updatedMeal : m
    );
    const dayTotals = sumMealTotals(meals);
    const warnings = shortfallWarnings(plan.dayTarget, dayTotals);
    setPlan({ ...plan, meals, dayTotals, warnings });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-bold">M|Dining Bulk Planner</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Set your macros, assign a dining hall to each meal, and get a plan
          built from M|Dining&apos;s posted menus and nutrition facts.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Daily macros</h2>
          <span className="text-xl font-bold">{totalCalories} kcal</span>
        </div>
        <Slider
          label="Protein"
          value={proteinG}
          min={80}
          max={350}
          step={5}
          colorClass="text-blue-500"
          kcalPerGram={4}
          onChange={setProteinG}
        />
        <Slider
          label="Carbs"
          value={carbG}
          min={100}
          max={700}
          step={10}
          colorClass="text-amber-500"
          kcalPerGram={4}
          onChange={setCarbG}
        />
        <Slider
          label="Fat"
          value={fatG}
          min={30}
          max={250}
          step={5}
          colorClass="text-rose-500"
          kcalPerGram={9}
          onChange={setFatG}
        />
      </section>

      <div>
        <h2 className="font-semibold mb-3">
          Meals today
          <span className="font-normal text-sm text-gray-500 dark:text-gray-400">
            {" "}
            &middot; {totalMeals} total
          </span>
        </h2>
        <div className="space-y-3">
          {MEAL_PERIODS.map((period) => (
            <PeriodCard
              key={period}
              period={period}
              state={periodState[period]}
              onCountChange={(n) => setPeriodCount(period, n)}
              onToggleHall={(hallSlug) => toggleHallForPeriod(period, hallSlug)}
            />
          ))}
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
        <h2 className="font-semibold">Allergens to avoid</h2>
        <CheckboxGrid
          options={ALLERGEN_OPTIONS.map((a) => ({
            key: a.key,
            label: a.label,
          }))}
          selected={excludedAllergens}
          onToggle={(k) =>
            toggleFromSet(excludedAllergens, setExcludedAllergens, k)
          }
        />
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
        <h2 className="font-semibold">Diet preference (optional)</h2>
        <CheckboxGrid
          options={DIET_OPTIONS}
          selected={requiredDiets}
          onToggle={(k) => toggleFromSet(requiredDiets, setRequiredDiets, k)}
        />
      </section>

      <button
        onClick={generatePlan}
        disabled={dataLoading || !!dataError || totalMeals === 0}
        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold transition-colors"
      >
        {dataLoading
          ? "Loading today's menus..."
          : "Generate today's meal plan"}
      </button>

      {menuData && (
        <p className="text-xs text-gray-400 -mt-4">
          Menu data refreshed{" "}
          {new Date(menuData.generatedAt).toLocaleString(undefined, {
            hour: "numeric",
            minute: "2-digit",
            month: "short",
            day: "numeric",
          })}{" "}
          &mdash; not necessarily today (see README for why this can&apos;t
          auto-refresh)
          {menuData.errors.length > 0 && (
            <> &middot; {menuData.errors.length} hall(s) failed to refresh</>
          )}
        </p>
      )}

      {(error || dataError) && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
          {error || dataError}
        </div>
      )}

      {plan && (
        <PlanResults plan={plan} onRegenerateMeal={handleRegenerateMeal} />
      )}

      <p className="text-xs text-gray-400 pt-4">
        &ldquo;Naturalness&rdquo; is a heuristic score (0-100) built from
        M|Dining&apos;s MHealthy nutrient-density tier, whether an item is
        deep-fried, and its sugar/sodium density &mdash; M|Dining does not
        publish per-item ingredient lists, so this is an estimate, not a
        literal ingredient audit. Always double-check allergen info in the
        dining hall before eating if you have a serious allergy.
      </p>
    </div>
  );
}
