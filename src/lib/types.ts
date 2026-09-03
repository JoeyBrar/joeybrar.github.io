export interface NutritionFacts {
  servingSize: string;
  calories: number;
  totalFatG: number;
  saturatedFatG: number;
  transFatG: number;
  cholesterolMg: number;
  sodiumMg: number;
  totalCarbG: number;
  fiberG: number;
  sugarG: number;
  proteinG: number;
}

export function emptyNutrition(): NutritionFacts {
  return {
    servingSize: "",
    calories: 0,
    totalFatG: 0,
    saturatedFatG: 0,
    transFatG: 0,
    cholesterolMg: 0,
    sodiumMg: 0,
    totalCarbG: 0,
    fiberG: 0,
    sugarG: 0,
    proteinG: 0,
  };
}

export interface MenuItem {
  id: string;
  name: string;
  hallSlug: string;
  hallName: string;
  mealPeriod: string;
  station: string;
  traits: string[];
  mhealthyTier: number | null;
  isDeepFried: boolean;
  allergens: string[];
  nutrition: NutritionFacts;
  naturalness: number;
}

export interface DiningHall {
  slug: string;
  name: string;
}

// The 8 dining halls M|Dining publishes full daily menus with nutrition facts for.
// (Lawyers Club / Martha Cook are residents-only "select access" halls and are
// intentionally left out — their menus aren't published the same way.)
export const DINING_HALLS: DiningHall[] = [
  { slug: "bursley", name: "Bursley" },
  { slug: "east-quad", name: "East Quad" },
  { slug: "markley", name: "Markley" },
  { slug: "mosher-jordan", name: "Mosher-Jordan (MoJo)" },
  { slug: "north-quad", name: "North Quad" },
  { slug: "south-quad", name: "South Quad" },
  { slug: "twigs-at-oxford", name: "Twigs at Oxford" },
  { slug: "wolverine-village-dining-hall", name: "Wolverine Village" },
];

export interface AllergenOption {
  key: string;
  label: string;
}

// Matches the allergen taxonomy M|Dining publishes on each menu item
// (verified against the `allergen-*` classes across all 8 dining hall pages).
export const ALLERGEN_OPTIONS: AllergenOption[] = [
  { key: "alcohol", label: "Alcohol" },
  { key: "beef", label: "Beef" },
  { key: "coconut", label: "Coconut" },
  { key: "eggs", label: "Eggs" },
  { key: "fish", label: "Fish" },
  { key: "milk", label: "Milk" },
  { key: "oats", label: "Oats" },
  { key: "peanuts", label: "Peanuts" },
  { key: "pork", label: "Pork" },
  { key: "sesame-seed", label: "Sesame" },
  { key: "shellfish", label: "Shellfish" },
  { key: "soy", label: "Soy" },
  { key: "tree-nuts", label: "Tree Nuts" },
  { key: "wheat_barley_rye", label: "Wheat / Barley / Rye (Gluten)" },
];

export interface DietOption {
  key: string; // matches a `trait-*` class
  label: string;
}

export const DIET_OPTIONS: DietOption[] = [
  { key: "vegan", label: "Vegan" },
  { key: "vegetarian", label: "Vegetarian" },
  { key: "halal", label: "Halal" },
  { key: "kosher", label: "Kosher" },
  { key: "glutenfree", label: "Gluten-Free" },
];

export interface MacroTargets {
  proteinG: number;
  carbG: number;
  fatG: number;
}

export function caloriesFromMacros(m: MacroTargets): number {
  return Math.round(m.proteinG * 4 + m.carbG * 4 + m.fatG * 9);
}

// M|Dining's data only ever carries these three periods in practice.
export const MEAL_PERIODS = ["Breakfast", "Lunch", "Dinner"] as const;
export type MealPeriodName = (typeof MEAL_PERIODS)[number];

export interface PeriodConfig {
  period: MealPeriodName;
  count: number;
  hallSlugs: string[];
}

export interface PlanRequest extends MacroTargets {
  periods: PeriodConfig[];
  excludedAllergens: string[];
  requiredDiets: string[];
}

export interface MealItemPick {
  item: MenuItem;
  qty: number;
}

export interface MealPlan {
  index: number;
  period: string;
  hallSlug: string | null;
  hallName: string | null;
  picks: MealItemPick[];
  totals: { calories: number; proteinG: number; carbG: number; fatG: number };
  target: { calories: number; proteinG: number; carbG: number; fatG: number };
  avgNaturalness: number;
  unresolved?: string;
}

export interface DayPlan {
  meals: MealPlan[];
  dayTarget: { calories: number; proteinG: number; carbG: number; fatG: number };
  dayTotals: { calories: number; proteinG: number; carbG: number; fatG: number };
  warnings: string[];
}
