import fs from "node:fs/promises";
import path from "node:path";
import { outputFiles, projectRoot } from "./config.mjs";
import { readCollection, writeJson } from "./json-store.mjs";
import { getSourceRegistry } from "./source-registry.mjs";

const providerCapabilitiesFile = path.join(
  projectRoot,
  "data",
  "provider-capabilities",
  "latest.json",
);

function latestBy(items, getKey, getDate) {
  const map = new Map();
  for (const item of items) {
    const key = getKey(item);
    const current = map.get(key);
    const nextTime = new Date(getDate(item) ?? 0).getTime();
    const currentTime = current ? new Date(getDate(current) ?? 0).getTime() : 0;
    if (!current || nextTime >= currentTime) {
      map.set(key, item);
    }
  }
  return map;
}

function normalizeLatestError(error) {
  if (!error) {
    return null;
  }

  return {
    type: error.type ?? "unknown",
    timestamp: error.timestamp ?? null,
    message:
      error.message ??
      error.robots?.blockedRule ??
      error.validation?.message ??
      error.validation?.details ??
      error.validation?.reason ??
      "Unknown error",
  };
}

function inferStatus({
  sourceId,
  productMetadataAvailable,
  priceAvailable,
  availabilityAvailable,
  storeLevelPricingAvailable,
  latestError,
  hasEvidence,
}) {
  if (sourceId === "kroger-public") {
    return "blocked";
  }
  if (sourceId === "walmart") {
    return "blocked";
  }
  if (latestError?.type === "blocked_by_robots") {
    return "blocked";
  }
  if (["kroger", "qfc", "fred-meyer"].includes(sourceId) && latestError) {
    return "blocked";
  }
  if (productMetadataAvailable && priceAvailable && availabilityAvailable && storeLevelPricingAvailable) {
    return "viable";
  }
  if (productMetadataAvailable || priceAvailable || hasEvidence) {
    return "partial";
  }
  if (latestError) {
    return "blocked";
  }
  return "untested";
}

function buildCurrentSupportFlags(sourceId) {
  switch (sourceId) {
    case "target-public":
      return { supportsSearch: false, supportsPdp: true };
    case "walmart":
      return { supportsSearch: false, supportsPdp: false };
    case "kroger-public":
      return { supportsSearch: false, supportsPdp: false };
    case "kroger":
    case "qfc":
    case "fred-meyer":
      return { supportsSearch: false, supportsPdp: false };
    default:
      return { supportsSearch: false, supportsPdp: false };
  }
}

function buildEvidenceNotes(source) {
  switch (source.id) {
    case "target-public":
      return "Public Target PDP proof succeeded for product metadata and visible price extraction across multiple PDPs. Current evidence points to generic online PDP pricing: zipCode is not used in requests, no store context is exposed, and observed prices remained unchanged between 98101 and 10001.";
    case "kroger-public":
      return "Not viable for now. Simple unauthenticated HTTP requests to Kroger public pages and robots.txt timed out or could not be verified.";
    case "walmart":
      return "Blocked by robots.txt for public search paths, so CartPrice stops before scraping.";
    case "kroger":
    case "qfc":
    case "fred-meyer":
      return "Official API path exists, but live ingestion is blocked until valid Kroger credentials are configured.";
    case "openstreetmap":
      return "Store discovery only. Not a product or price provider.";
    case "google-places":
      return "Store discovery only, and currently unconfigured.";
    default:
      return source.notes ?? "";
  }
}

function compactSummaryLine(report) {
  const price = report.priceAvailable ? "price" : "no-price";
  const availability = report.availabilityAvailable ? "availability" : "no-availability";
  return `${report.sourceId.padEnd(18)} ${report.status.padEnd(8)} ${price.padEnd(8)} ${availability.padEnd(15)} ${report.latestError?.message ?? "ok"}`;
}

export async function buildProviderCapabilitiesReport() {
  const [sources, productsPayload, pricesPayload, errorHistory] = await Promise.all([
    getSourceRegistry(),
    fs.readFile(outputFiles.normalizedProducts, "utf8").then((contents) => JSON.parse(contents)).catch(() => ({ products: [] })),
    fs.readFile(outputFiles.latestPrices, "utf8").then((contents) => JSON.parse(contents)).catch(() => ({ prices: [] })),
    readCollection(outputFiles.errorsDb),
  ]);

  const products = Array.isArray(productsPayload.products) ? productsPayload.products : [];
  const prices = Array.isArray(pricesPayload.prices) ? pricesPayload.prices : [];
  const latestErrorsBySource = latestBy(errorHistory, (entry) => entry.sourceId, (entry) => entry.timestamp);

  const reports = sources.map((source) => {
    const sourceProducts = products.filter((product) => product.source === source.id);
    const sourcePrices = prices.filter((price) => {
      if (source.id === "target-public") {
        return price.retailer === "Target Public Product Pages";
      }
      if (source.id === "kroger-public") {
        return price.retailer === "Kroger Public Pages";
      }
      if (source.id === "walmart") {
        return price.retailer === "Walmart";
      }
      if (source.id === "kroger") {
        return price.retailer === "Kroger";
      }
      if (source.id === "qfc") {
        return price.retailer === "QFC";
      }
      if (source.id === "fred-meyer") {
        return price.retailer === "Fred Meyer";
      }
      return false;
    });

    const productMetadataAvailable = sourceProducts.length > 0;
    const priceAvailable = sourcePrices.some((price) => typeof price.price === "number");
    const availabilityAvailable = sourceProducts.some(
      (product) => product.availability && product.availability !== "unknown",
    );
    const storeLevelPricingAvailable = sourcePrices.some((price) => Boolean(price.store_id));
    const latestObservedCandidates = [
      ...sourceProducts.map((product) => product.priceUpdatedAt ?? product.lastSeenAt ?? null),
      ...sourcePrices.map((price) => price.observed_at ?? null),
    ].filter(Boolean);
    const latestObservedAt = latestObservedCandidates.sort(
      (left, right) => new Date(right).getTime() - new Date(left).getTime(),
    )[0] ?? null;
    const latestError = normalizeLatestError(latestErrorsBySource.get(source.id));
    const { supportsSearch, supportsPdp } = buildCurrentSupportFlags(source.id);
    const hasEvidence = productMetadataAvailable || priceAvailable || latestError != null;

    return {
      sourceId: source.id,
      sourceType: source.type,
      status: inferStatus({
        sourceId: source.id,
        productMetadataAvailable,
        priceAvailable,
        availabilityAvailable,
        storeLevelPricingAvailable,
        latestError,
        hasEvidence,
      }),
      productMetadataAvailable,
      priceAvailable,
      availabilityAvailable,
      storeLevelPricingAvailable,
      supportsSearch,
      supportsPdp,
      latestObservedAt,
      latestError,
      notes: buildEvidenceNotes(source),
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    count: reports.length,
    providers: reports,
  };

  await writeJson(providerCapabilitiesFile, report);
  return report;
}

export function printProviderCapabilitiesSummary(report) {
  console.log("sourceId".padEnd(18), "status".padEnd(8), "price".padEnd(8), "availability".padEnd(15), "latestError");
  for (const provider of report.providers) {
    console.log(compactSummaryLine(provider));
  }
}
