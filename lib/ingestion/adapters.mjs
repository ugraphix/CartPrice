import { getSourceById } from "./source-registry.mjs";
import { KrogerAdapter } from "./kroger-adapter.mjs";
import { KrogerPublicScraperAdapter } from "./kroger-public-scraper-adapter.mjs";
import { TargetPublicScraperAdapter } from "./target-public-scraper-adapter.mjs";
import { WalmartScraperAdapter } from "./walmart-scraper-adapter.mjs";

export async function createAdapter(sourceId) {
  const source = await getSourceById(sourceId);
  switch (sourceId) {
    case "kroger":
    case "qfc":
    case "fred-meyer":
      return new KrogerAdapter({ source });
    case "kroger-public":
      return new KrogerPublicScraperAdapter({ source });
    case "target-public":
      return new TargetPublicScraperAdapter({ source });
    case "walmart":
      return new WalmartScraperAdapter({ source });
    default:
      throw new Error(`No adapter implemented for source: ${sourceId}`);
  }
}
