// Run offline (by the GitHub Actions workflow, or manually with
// `npx tsx scripts/fetch-menus.ts`) to snapshot today's menus from every
// M|Dining hall into public/menu-data.json, which the statically-exported
// site fetches and reads client-side. GitHub Pages can't run a server, so
// this replaces per-request live scraping with a periodically-refreshed
// static snapshot instead.
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { scrapeHall } from "../src/lib/scrape";
import { DINING_HALLS, MenuItem } from "../src/lib/types";

async function main() {
  const results = await Promise.all(
    DINING_HALLS.map(async (hall) => {
      try {
        const items = await scrapeHall(hall.slug, hall.name);
        console.log(`  ${hall.name}: ${items.length} items`);
        return { hall, items, error: null as string | null };
      } catch (e) {
        const error = e instanceof Error ? e.message : "Unknown error";
        console.error(`  ${hall.name}: FAILED (${error})`);
        return { hall, items: [] as MenuItem[], error };
      }
    })
  );

  const items = results.flatMap((r) => r.items);
  const errors = results
    .filter((r) => r.error)
    .map((r) => `${r.hall.name}: ${r.error}`);

  const payload = {
    generatedAt: new Date().toISOString(),
    items,
    errors,
  };

  const outDir = path.join(__dirname, "..", "public");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "menu-data.json");
  writeFileSync(outPath, JSON.stringify(payload));

  console.log(
    `\nWrote ${items.length} items across ${DINING_HALLS.length} halls to ${outPath}`
  );
  if (errors.length > 0) {
    console.log(`Errors: ${errors.length}`);
  }
}

main();
