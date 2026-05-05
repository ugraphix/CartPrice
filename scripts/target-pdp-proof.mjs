import path from "node:path";
import { createAdapter } from "../lib/ingestion/adapters.mjs";
import { configDir, readJsonFile } from "../lib/ingestion/config.mjs";

const fixturePath = path.join(configDir, "target-pdp-proof-urls.json");
const fixtures = await readJsonFile(fixturePath);
const adapter = await createAdapter("target-public");

const results = [];

for (const fixture of fixtures) {
  try {
    const response = await adapter.searchProducts({ productUrl: fixture.url });
    const rawProduct = response.products[0] ?? null;
    const product = rawProduct
      ? adapter.normalizeProduct(rawProduct, {
          retailer: adapter.source.retailerName,
          sourceUrl: response.sourceUrl,
        })
      : null;

    results.push({
      category: fixture.category,
      requestedLabel: fixture.label,
      requestedUrl: fixture.url,
      productExtracted: Boolean(product),
      name: product?.name ?? null,
      brand: product?.brand ?? null,
      size: product?.size ?? null,
      price: product?.price ?? null,
      availability: product?.availability ?? null,
      productUrl: product?.productUrl ?? null,
      error: null,
    });
  } catch (error) {
    results.push({
      category: fixture.category,
      requestedLabel: fixture.label,
      requestedUrl: fixture.url,
      productExtracted: false,
      name: null,
      brand: null,
      size: null,
      price: null,
      availability: null,
      productUrl: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const successCount = results.filter((result) => result.productExtracted).length;
const failureCount = results.length - successCount;
const priceExtractionRate = results.filter((result) => typeof result.price === "number").length / results.length;
const brandExtractionRate = results.filter((result) => Boolean(result.brand) && result.brand !== "Unknown Brand").length / results.length;
const sizeExtractionRate = results.filter((result) => Boolean(result.size)).length / results.length;
const availabilityExtractionRate = results.filter(
  (result) => Boolean(result.availability) && result.availability !== "unknown",
).length / results.length;

console.log(JSON.stringify({
  fixtureCount: results.length,
  successCount,
  failureCount,
  priceExtractionRate,
  brandExtractionRate,
  sizeExtractionRate,
  availabilityExtractionRate,
  results,
}, null, 2));
