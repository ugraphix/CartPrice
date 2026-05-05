import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const currentFilePath = fileURLToPath(import.meta.url);

export const projectRoot = path.resolve(path.dirname(currentFilePath), "..", "..");
export const configDir = path.join(projectRoot, "config");
export const dataDir = path.join(projectRoot, "data");

export const outputFiles = {
  latestRun: path.join(dataDir, "ingestion-runs", "latest.json"),
  latestBasketComparison: path.join(dataDir, "compare", "latest-basket-comparison.json"),
  normalizedProducts: path.join(dataDir, "products", "normalized-products.json"),
  latestPrices: path.join(dataDir, "prices", "latest-prices.json"),
  sourceErrors: path.join(dataDir, "errors", "source-errors.json"),
  productMatches: path.join(dataDir, "matches", "product-matches.json"),
  storesDb: path.join(dataDir, "db", "stores.json"),
  productsDb: path.join(dataDir, "db", "products.json"),
  pricesDb: path.join(dataDir, "db", "product-prices.json"),
  availabilityDb: path.join(dataDir, "db", "product-availability.json"),
  runsDb: path.join(dataDir, "db", "ingestion-runs.json"),
  errorsDb: path.join(dataDir, "db", "source-errors.json"),
  matchesDb: path.join(dataDir, "db", "product-matches.json"),
  cacheDir: path.join(dataDir, ".cache"),
};

export const defaultUserAgent =
  process.env.CARTPRICE_USER_AGENT?.trim() ||
  "CartPriceBot/0.1 (+https://example.com/cartprice; contact: local-development)";

export async function readJsonFile(filePath) {
  const contents = await fs.readFile(filePath, "utf8");
  return JSON.parse(contents);
}

export async function loadSourceRegistry() {
  return readJsonFile(path.join(configDir, "grocery-sources.json"));
}

export async function loadCoreBasket() {
  return readJsonFile(path.join(configDir, "core-basket.json"));
}
