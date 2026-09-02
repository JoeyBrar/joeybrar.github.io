"use client";

import { useEffect, useMemo, useState } from "react";
import { buildDayPlan } from "@/lib/planner";
import {
  ALLERGEN_OPTIONS,
  DayPlan,
  DIET_OPTIONS,
  DINING_HALLS,
  MenuItem,
  caloriesFromMacros,
} from "@/lib/types";
import PlanResults from "./PlanResults";

interface MenuDataFile {
  generatedAt: string;
  items: MenuItem[];
  errors: string[];
}

const DEFAULT_PROTEIN = 190;
const DEFAULT_CARB = 450;
const DEFAULT_FAT = 90;

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

export default function PlannerApp() {
  const [proteinG, setProteinG] = useState(DEFAULT_PROTEIN);
  const [carbG, setCarbG] = useState(DEFAULT_CARB);
  const [fatG, setFatG] = useState(DEFAULT_FAT);
  const [mealsPerDay, setMealsPerDay] = useState(4);
  const [selectedHalls, setSelectedHalls] = useState<Set<string>>(
    new Set(["mosher-jordan"])
  );
  const [excludedAllergens, setExcludedAllergens] = useState<Set<string>>(
    new Set()
  );
  const [requiredDiets, setRequiredDiets] = useState<Set<string>>(new Set());

  const [plan, setPlan] = useState<DayPlan | null>(null);
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

  function generatePlan() {
    setError(null);
    if (selectedHalls.size === 0) {
      setError("Select at least one dining hall.");
      return;
    }
    if (!menuData) {
      setError("Menu data isn't loaded yet.");
      return;
    }
    const result = buildDayPlan(menuData.items, {
      proteinG,
      carbG,
      fatG,
      mealsPerDay,
      hallSlugs: Array.from(selectedHalls),
      excludedAllergens: Array.from(excludedAllergens),
      requiredDiets: Array.from(requiredDiets),
    });
    setPlan(result);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-bold">M|Dining Bulk Planner</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Set your macros, pick your dining halls and allergens, and get
          today&apos;s meal plan built from M|Dining&apos;s posted menus and
          nutrition facts, refreshed periodically throughout the day.
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

      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
        <h2 className="font-semibold">Meals per day</h2>
        <div className="flex gap-2">
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              onClick={() => setMealsPerDay(n)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                mealsPerDay === n
                  ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900"
                  : "border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
        <h2 className="font-semibold">Dining halls you&apos;ll visit today</h2>
        <CheckboxGrid
          options={DINING_HALLS.map((h) => ({ key: h.slug, label: h.name }))}
          selected={selectedHalls}
          onToggle={(k) => toggleFromSet(selectedHalls, setSelectedHalls, k)}
        />
      </section>

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
        disabled={dataLoading || !!dataError}
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
          })}
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

      {plan && <PlanResults plan={plan} />}

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
