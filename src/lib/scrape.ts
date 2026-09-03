import * as cheerio from "cheerio";
import { emptyNutrition, MenuItem, NutritionFacts } from "./types";
import { naturalnessScore } from "./naturalness";

const BASE = "https://dining.umich.edu/menus-locations/dining-halls";

function parseNumber(text: string): number {
  const m = text.match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

function parseNutritionTable(
  $: cheerio.CheerioAPI,
  table: ReturnType<cheerio.CheerioAPI>
): NutritionFacts {
  const facts = emptyNutrition();

  table.find("tr").each((_, tr) => {
    const rowText = $(tr).text().replace(/\s+/g, " ").trim();
    if (!rowText) return;

    if (/serving size/i.test(rowText)) {
      facts.servingSize = rowText.replace(/serving size/i, "").trim();
    } else if (/^calories\b/i.test(rowText)) {
      facts.calories = parseNumber(rowText);
    } else if (/saturated fat/i.test(rowText)) {
      facts.saturatedFatG = parseNumber(rowText);
    } else if (/trans fat/i.test(rowText)) {
      facts.transFatG = parseNumber(rowText);
    } else if (/total fat/i.test(rowText)) {
      facts.totalFatG = parseNumber(rowText);
    } else if (/cholesterol/i.test(rowText)) {
      facts.cholesterolMg = parseNumber(rowText);
    } else if (/sodium/i.test(rowText)) {
      facts.sodiumMg = parseNumber(rowText);
    } else if (/dietary fiber/i.test(rowText)) {
      facts.fiberG = parseNumber(rowText);
    } else if (/sugars/i.test(rowText)) {
      facts.sugarG = parseNumber(rowText);
    } else if (/total carbohydrate/i.test(rowText)) {
      facts.totalCarbG = parseNumber(rowText);
    } else if (/^protein\b/i.test(rowText)) {
      facts.proteinG = parseNumber(rowText);
    }
  });

  return facts;
}

export async function scrapeHall(
  hallSlug: string,
  hallName: string
): Promise<MenuItem[]> {
  const url = `${BASE}/${hallSlug}/`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; UMichBulkPlanner/1.0; +https://dining.umich.edu)",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const isCloudflareBlock =
      res.status === 403 && res.headers.get("server") === "cloudflare";
    throw new Error(
      isCloudflareBlock
        ? `Blocked by dining.umich.edu's Cloudflare bot protection (HTTP 403) — this host's IP is likely flagged as a bot/datacenter address.`
        : `Failed to fetch ${hallName} menu (HTTP ${res.status})`
    );
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const items: MenuItem[] = [];

  const container = $("#mdining-items");
  if (container.length === 0) return items;

  container.children("h3").each((_, h3El) => {
    const mealPeriod = $(h3El).text().replace(/\s+/g, " ").trim();
    const courses = $(h3El).next(".courses");
    if (courses.length === 0) return;

    courses.find(".courses_wrapper > li").each((_, stationLi) => {
      const $stationLi = $(stationLi);
      const station =
        $stationLi.children("h4").first().text().replace(/\s+/g, " ").trim() ||
        "Other";

      $stationLi.find("ul.items > li").each((_, itemLi) => {
        const $itemLi = $(itemLi);
        const classes = ($itemLi.attr("class") || "")
          .split(/\s+/)
          .filter(Boolean);

        const name = $itemLi
          .find("span.item-name")
          .first()
          .text()
          .replace(/\s+/g, " ")
          .trim();
        if (!name) return;

        // M|Dining's markup inconsistently nests the .nutrition panel either
        // as a sibling of the item <li> or inside it — handle both.
        let nutritionDiv = $itemLi.next(".nutrition");
        if (nutritionDiv.length === 0) {
          nutritionDiv = $itemLi.find(".nutrition");
        }
        const table = nutritionDiv.find("table.nutrition-facts").first();
        // Placeholder cards for closed stations (e.g. "No Service at this
        // Time") render without a nutrition-facts table at all — skip them,
        // they aren't real orderable food and would otherwise show up as
        // free zero-macro filler in the solver.
        if (table.length === 0) return;
        const nutrition = parseNutritionTable($, table);

        const traits = classes
          .filter((c) => c.startsWith("trait-"))
          .map((c) => c.slice("trait-".length));
        const allergenClasses = classes
          .filter((c) => c.startsWith("allergen-"))
          .map((c) => c.slice("allergen-".length));
        const isDeepFried = allergenClasses.includes("item-is-deep-fried");
        const allergens = allergenClasses.filter(
          (a) => a !== "item-is-deep-fried"
        );

        const mhealthyTrait = traits.find((t) => /^mhealthy\d$/.test(t));
        const mhealthyTier = mhealthyTrait
          ? parseInt(mhealthyTrait.replace("mhealthy", ""), 10)
          : null;

        const item: MenuItem = {
          id: `${hallSlug}__${mealPeriod}__${station}__${name}`
            .toLowerCase()
            .replace(/\s+/g, "-"),
          name,
          hallSlug,
          hallName,
          mealPeriod,
          station,
          traits,
          mhealthyTier,
          isDeepFried,
          allergens,
          nutrition,
          naturalness: 0,
        };
        item.naturalness = naturalnessScore(item);
        items.push(item);
      });
    });
  });

  return items;
}

