import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareStoreCatalog } from "../comparison-domain.ts";
import { pricingRules, sampleZipCoordinates, stores as demoStores, products as demoProducts } from "../data.ts";
import { normalizeText } from "../fuzzy.ts";
import type {
  ComparableCatalogProduct,
  ComparisonDataHealth,
  ComparisonProviderMode,
  Coordinates,
  DayKey,
  OpeningWindow,
  PricingScope,
  ReferencePriceResult,
  ShoppingListItem,
  Store,
  StoreComparison,
} from "../types.ts";
import type { ComparisonRequest } from "../integrations/types.ts";

type LiveArtifactProduct = {
  source?: string;
  retailer?: string;
  pricingScope?: PricingScope;
  storeId: string | null;
  storeName?: string | null;
  productId: string;
  sku?: string | null;
  upc?: string | null;
  name: string;
  brand?: string | null;
  size?: string | null;
  unit?: string | null;
  category?: string | null;
  price?: number | null;
  regularPrice?: number | null;
  salePrice?: number | null;
  unitPrice?: number | null;
  currency?: string | null;
  availability?: string | null;
  fulfillmentModes?: string[];
  lastSeenAt?: string | null;
  priceUpdatedAt?: string | null;
  sourceUrl?: string | null;
  raw?: unknown;
};

type LiveArtifactPrice = {
  product_id: string;
  store_id: string;
  pricing_scope?: PricingScope | null;
  price?: number | null;
  regular_price?: number | null;
  sale_price?: number | null;
  unit_price?: number | null;
  currency?: string | null;
  source_url?: string | null;
  observed_at?: string | null;
  expires_at?: string | null;
  confidence_score?: number | null;
};

type LiveArtifactStore = {
  id: string;
  externalStoreCode?: string | null;
  name?: string | null;
  zipCode?: string | null;
  city?: string | null;
  stateCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  observedAt?: string | null;
  raw?: {
    tags?: {
      brand?: string;
      opening_hours?: string;
    };
  };
};

type LiveArtifactMatch = {
  productId?: string;
  canonicalProductId?: string;
  matchConfidence?: number;
  matchMethod?: "upc" | "exact" | "fuzzy" | "manual";
};

type LiveArtifacts = {
  products: LiveArtifactProduct[];
  prices: LiveArtifactPrice[];
  stores: LiveArtifactStore[];
  matches: LiveArtifactMatch[];
  health: ComparisonDataHealth;
};

export type UnifiedComparisonResponse = {
  ranked: StoreComparison[];
  unsupported: StoreComparison[];
  referencePricing: ReferencePriceResult[];
  cheapest?: StoreComparison;
  nextCheapest?: StoreComparison;
  coverage: {
    supported: number;
    unsupported: number;
    searched: number;
  };
  generatedAt: string;
  providerModeRequested: ComparisonProviderMode;
  providerModeResolved: "demo" | "live";
  liveDataHealth: ComparisonDataHealth;
  warning?: string;
  liveDataUnavailable?: boolean;
  warnings?: string[];
  sources: {
    stores: string;
    pricing: string[];
    taxes: string;
  };
};

const currentFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFilePath), "..", "..");

const artifactFiles = {
  comparison: path.join(projectRoot, "data", "compare", "latest-basket-comparison.json"),
  normalizedProducts: path.join(projectRoot, "data", "products", "normalized-products.json"),
  latestPrices: path.join(projectRoot, "data", "prices", "latest-prices.json"),
  storesDb: path.join(projectRoot, "data", "db", "stores.json"),
  productMatches: path.join(projectRoot, "data", "matches", "product-matches.json"),
  coreBasket: path.join(projectRoot, "config", "core-basket.json"),
};

const allDays: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function nowIso() {
  return new Date().toISOString();
}

function emptyHours(): Record<DayKey, OpeningWindow[]> {
  return {
    sunday: [],
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
  };
}

async function readJsonOrDefault<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return JSON.parse(contents) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function latestIso(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function getHealthWarning(productCount: number, priceCount: number, storeCount: number) {
  if (productCount === 0) {
    return "Live data unavailable: no normalized products have been ingested yet. Run a successful Kroger/QFC ingestion first.";
  }
  if (priceCount === 0) {
    return "Live data unavailable: products exist, but no live price observations are available yet.";
  }
  if (storeCount === 0) {
    return "Live data unavailable: no store discovery artifact is available yet.";
  }
  return undefined;
}

function buildDataHealth(params: {
  productCount: number;
  priceCount: number;
  storeCount: number;
  latestObservedAt?: string | null;
  latestPriceUpdatedAt?: string | null;
}): ComparisonDataHealth {
  const warning = getHealthWarning(params.productCount, params.priceCount, params.storeCount);
  return {
    mode: "live",
    productCount: params.productCount,
    priceCount: params.priceCount,
    storeCount: params.storeCount,
    latestObservedAt: params.latestObservedAt ?? null,
    latestPriceUpdatedAt: params.latestPriceUpdatedAt ?? null,
    usable: !warning,
    warning,
  };
}

function parseDayToken(dayToken: string) {
  const dayMap: Record<string, DayKey> = {
    Su: "sunday",
    Mo: "monday",
    Tu: "tuesday",
    We: "wednesday",
    Th: "thursday",
    Fr: "friday",
    Sa: "saturday",
  };

  return dayMap[dayToken] ?? null;
}

function parseDayExpression(dayExpression: string): DayKey[] {
  const cleaned = dayExpression.replaceAll("PH,", "").replaceAll(",PH", "").trim();
  if (!cleaned) {
    return allDays;
  }

  return cleaned
    .split(",")
    .flatMap((segment) => {
      const part = segment.trim();
      if (!part) {
        return [];
      }
      const rangeMatch = part.match(/^([A-Za-z]{2})-([A-Za-z]{2})$/);
      if (rangeMatch) {
        const start = parseDayToken(rangeMatch[1]);
        const end = parseDayToken(rangeMatch[2]);
        if (!start || !end) {
          return [];
        }
        const startIndex = allDays.indexOf(start);
        const endIndex = allDays.indexOf(end);
        if (startIndex <= endIndex) {
          return allDays.slice(startIndex, endIndex + 1);
        }
        return [...allDays.slice(startIndex), ...allDays.slice(0, endIndex + 1)];
      }
      const single = parseDayToken(part);
      return single ? [single] : [];
    })
    .filter((day, index, source) => source.indexOf(day) === index);
}

function parseTimeRanges(timeExpression: string): OpeningWindow[] {
  return timeExpression
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .flatMap((segment) => {
      const match = segment.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
      if (!match) {
        return [];
      }
      return [{ start: match[1], end: match[2] }];
    });
}

function parseOpeningHours(value?: string | null): Record<DayKey, OpeningWindow[]> {
  const hours = emptyHours();
  if (!value) {
    return hours;
  }

  const normalized = value.trim();
  if (!normalized) {
    return hours;
  }

  if (normalized === "24/7") {
    for (const day of allDays) {
      hours[day] = [{ start: "00:00", end: "23:59" }];
    }
    return hours;
  }

  for (const clause of normalized.split(";")) {
    const trimmedClause = clause.trim();
    if (!trimmedClause) {
      continue;
    }

    const explicitMatch = trimmedClause.match(/^([A-Za-z,\-]+)\s+(.+)$/);
    const days = explicitMatch ? parseDayExpression(explicitMatch[1]) : allDays;
    const timeExpression = explicitMatch ? explicitMatch[2].trim() : trimmedClause;
    const windows = parseTimeRanges(timeExpression);

    for (const day of days) {
      hours[day] = windows;
    }
  }

  return hours;
}

function buildPriceMap(prices: LiveArtifactPrice[]) {
  const latestByKey = new Map<string, LiveArtifactPrice>();
  for (const record of prices) {
    const key = `${record.product_id}:${record.store_id}`;
    const current = latestByKey.get(key);
    const currentObservedAt = current?.observed_at ? new Date(current.observed_at).getTime() : 0;
    const nextObservedAt = record.observed_at ? new Date(record.observed_at).getTime() : 0;
    if (!current || nextObservedAt >= currentObservedAt) {
      latestByKey.set(key, record);
    }
  }
  return latestByKey;
}

function inferArtifactPricingScope(product: LiveArtifactProduct, latestPrice?: LiveArtifactPrice) {
  if (latestPrice?.pricing_scope) {
    return latestPrice.pricing_scope;
  }
  if (product.pricingScope) {
    return product.pricingScope;
  }
  if (product.source === "target-public") {
    return "online_generic" as const;
  }
  if (["kroger", "qfc", "fred-meyer"].includes(product.source ?? "")) {
    return "store_level" as const;
  }
  return "unknown" as const;
}

function buildMatchMap(matches: LiveArtifactMatch[]) {
  const matchMap = new Map<string, LiveArtifactMatch>();
  for (const match of matches) {
    if (match.productId) {
      matchMap.set(match.productId, match);
    }
  }
  return matchMap;
}

function isStalePrice(record?: LiveArtifactPrice, fallbackUpdatedAt?: string | null) {
  if (record?.expires_at) {
    return new Date(record.expires_at).getTime() <= Date.now();
  }
  const freshnessAnchor = fallbackUpdatedAt ?? record?.observed_at ?? null;
  if (!freshnessAnchor) {
    return true;
  }
  return Date.now() - new Date(freshnessAnchor).getTime() > 24 * 60 * 60 * 1000;
}

function buildLiveStores(stores: LiveArtifactStore[], supportedStoreIds: Set<string>) {
  const filteredStores = stores.filter((store) => {
    const candidates = [store.externalStoreCode, store.id].filter(Boolean) as string[];
    return candidates.some((candidate) => supportedStoreIds.has(candidate));
  });

  return filteredStores.map((store) => {
    const storeId = store.externalStoreCode ?? store.id;
    const brand = store.raw?.tags?.brand ?? store.name ?? "Unknown";
    return {
      id: storeId,
      chain: brand,
      name: store.name ?? brand,
      address: [store.city, store.stateCode, store.zipCode].filter(Boolean).join(", ") || storeId,
      coordinates: {
        lat: store.latitude ?? 0,
        lng: store.longitude ?? 0,
      },
      timezone: "America/Los_Angeles",
      supportsPricing: true,
      placeId: store.id,
      hours: parseOpeningHours(store.raw?.tags?.opening_hours),
    } satisfies Store;
  });
}

function buildLiveProducts(
  products: LiveArtifactProduct[],
  prices: LiveArtifactPrice[],
  matches: LiveArtifactMatch[],
) {
  const latestPriceMap = buildPriceMap(prices);
  const matchMap = buildMatchMap(matches);

  return products.map((product) => {
    const latestPrice = latestPriceMap.get(`${product.productId}:${product.storeId}`);
    const match = matchMap.get(product.productId);
    const normalizedName = normalizeText(
      [product.brand, product.name, product.size, match?.canonicalProductId].filter(Boolean).join(" "),
    );
    const searchAliases = [
      product.name,
      product.brand ?? undefined,
      product.size ?? undefined,
      product.category ?? undefined,
      match?.canonicalProductId,
    ].filter((value): value is string => Boolean(value));

    return {
      id: product.productId,
      storeId: product.storeId,
      pricingScope: inferArtifactPricingScope(product, latestPrice),
      sku: product.sku ?? product.productId,
      upc: product.upc ?? null,
      brand: product.brand ?? "Unknown",
      name: product.name,
      normalizedName,
      searchAliases,
      category: normalizeText(product.category ?? "grocery"),
      sizeText: product.size ?? undefined,
      sizeUnit: product.unit ?? undefined,
      price: latestPrice?.price ?? product.price ?? null,
      regularPrice: latestPrice?.regular_price ?? product.regularPrice ?? null,
      salePrice: latestPrice?.sale_price ?? product.salePrice ?? null,
      unitPrice: latestPrice?.unit_price ?? product.unitPrice ?? null,
      currency: latestPrice?.currency ?? product.currency ?? "USD",
      availability: product.availability ?? "unknown",
      fulfillmentModes: product.fulfillmentModes ?? [],
      source: product.source ?? "live",
      sourceUrl: latestPrice?.source_url ?? product.sourceUrl ?? null,
      priceUpdatedAt: product.priceUpdatedAt ?? latestPrice?.observed_at ?? product.lastSeenAt ?? null,
      stalePrice: isStalePrice(latestPrice, product.priceUpdatedAt ?? product.lastSeenAt ?? null),
      raw: {
        product,
        latestPrice,
        match,
      },
    } satisfies ComparableCatalogProduct;
  });
}

async function readLiveArtifacts(): Promise<LiveArtifacts> {
  const [productsPayload, pricesPayload, storesPayload, matchesPayload] = await Promise.all([
    readJsonOrDefault<{ products?: LiveArtifactProduct[] }>(artifactFiles.normalizedProducts, {
      products: [],
    }),
    readJsonOrDefault<{ prices?: LiveArtifactPrice[] }>(artifactFiles.latestPrices, {
      prices: [],
    }),
    readJsonOrDefault<LiveArtifactStore[]>(artifactFiles.storesDb, []),
    readJsonOrDefault<{ matches?: LiveArtifactMatch[] }>(artifactFiles.productMatches, {
      matches: [],
    }),
  ]);

  const products = Array.isArray(productsPayload.products) ? productsPayload.products : [];
  const prices = Array.isArray(pricesPayload.prices) ? pricesPayload.prices : [];
  const stores = Array.isArray(storesPayload) ? storesPayload : [];
  const matches = Array.isArray(matchesPayload.matches) ? matchesPayload.matches : [];
  const health = buildDataHealth({
    productCount: products.length,
    priceCount: prices.length,
    storeCount: stores.length,
    latestObservedAt: latestIso(prices.map((price) => price.observed_at)),
    latestPriceUpdatedAt: latestIso(products.map((product) => product.priceUpdatedAt)),
  });

  return {
    products,
    prices,
    stores,
    matches,
    health,
  };
}

function mapDemoBasketProducts(): ComparableCatalogProduct[] {
  return demoProducts.map((product) => ({
    id: product.id,
    storeId: product.storeId,
    pricingScope: "store_level",
    sku: product.sku,
    brand: product.brand,
    name: product.name,
    normalizedName: product.normalizedName,
    searchAliases: product.searchAliases,
    category: product.category,
    variant: product.variant,
    sizeValue: product.sizeValue,
    sizeUnit: product.sizeUnit,
    packageCount: product.packageCount,
    price: product.price,
    taxable: product.taxable,
    beverageTaxable: product.beverageTaxable,
    bagUnits: product.bagUnits,
    availability: "in_stock",
    source: "demo",
    stalePrice: false,
  }));
}

function buildEmptyComparison(params: {
  requestedMode: ComparisonProviderMode;
  health: ComparisonDataHealth;
  warning: string;
}): UnifiedComparisonResponse {
  return {
    generatedAt: nowIso(),
    providerModeRequested: params.requestedMode,
    providerModeResolved: "live",
    liveDataHealth: params.health,
    liveDataUnavailable: true,
    warning: params.warning,
    warnings: params.warning ? [params.warning] : [],
    ranked: [],
    unsupported: [],
    referencePricing: [],
    cheapest: undefined,
    nextCheapest: undefined,
    coverage: {
      supported: 0,
      unsupported: 0,
      searched: 0,
    },
    sources: {
      stores: "live-artifacts",
      pricing: [],
      taxes: "seeded-pricing-rules",
    },
  };
}

function resolveZipCoordinates(zipCode: string): Coordinates {
  return sampleZipCoordinates[zipCode]?.lat
    ? {
        lat: sampleZipCoordinates[zipCode].lat,
        lng: sampleZipCoordinates[zipCode].lng,
      }
    : {
        lat: sampleZipCoordinates["98101"].lat,
        lng: sampleZipCoordinates["98101"].lng,
      };
}

async function loadCoreBasketAsShoppingList() {
  const basket = await readJsonOrDefault<
    Array<{ id: string; query: string; category?: string; popularity?: string }>
  >(artifactFiles.coreBasket, []);

  return basket.map((item) => ({
    id: item.id,
    rawName: item.query,
    quantity: 1,
    preferredCategory: item.category,
  })) satisfies ShoppingListItem[];
}

function buildSourcesLabel(products: ComparableCatalogProduct[]) {
  const providers = new Set(
    products
      .map((product) => product.source)
      .filter((source): source is string => Boolean(source)),
  );
  return [...providers];
}

function collectPricingScopeWarnings(products: ComparableCatalogProduct[]) {
  const warnings = [];
  const hasStoreLevel = products.some((product) => product.pricingScope === "store_level");
  const hasOnlineGeneric = products.some((product) => product.pricingScope === "online_generic");
  if (!hasStoreLevel) {
    warnings.push("No store-level live pricing is available for cheapest-store ranking.");
  }
  if (hasOnlineGeneric) {
    warnings.push("Target public PDP pricing is generic online pricing and should not be used for local store ranking.");
  }
  const hasUnknown = products.some((product) => product.pricingScope === "unknown");
  if (hasUnknown) {
    warnings.push("Some live prices have unknown pricing scope and are excluded from cheapest-store ranking.");
  }
  return warnings;
}

export async function getLiveComparisonDataHealth() {
  const { health } = await readLiveArtifacts();
  return health;
}

export async function buildComparison(
  request: ComparisonRequest,
  options: { providerMode?: ComparisonProviderMode } = {},
): Promise<UnifiedComparisonResponse> {
  const providerMode = options.providerMode ?? "auto";
  const liveArtifacts = await readLiveArtifacts();

  if (providerMode === "live" && !liveArtifacts.health.usable) {
    return buildEmptyComparison({
      requestedMode: providerMode,
      health: liveArtifacts.health,
      warning: liveArtifacts.health.warning ?? "Live data unavailable.",
    });
  }

  if (providerMode === "live" || (providerMode === "auto" && liveArtifacts.health.usable)) {
    const liveProducts = buildLiveProducts(
      liveArtifacts.products,
      liveArtifacts.prices,
      liveArtifacts.matches,
    );
    const liveStoreIds = new Set(
      liveProducts
        .map((product) => product.storeId)
        .filter((storeId): storeId is string => Boolean(storeId)),
    );
    const liveStores = buildLiveStores(liveArtifacts.stores, liveStoreIds);
    const liveResult = compareStoreCatalog({
      stores: liveStores,
      products: liveProducts,
      pricingRules,
      userLocation: request.location,
      radiusMiles: request.radiusMiles,
      shoppingList: request.shoppingList,
      openNowOnly: request.openNowOnly,
    });
    const scopeWarnings = collectPricingScopeWarnings(liveProducts);

    return {
      generatedAt: nowIso(),
      providerModeRequested: providerMode,
      providerModeResolved: "live",
      liveDataHealth: liveArtifacts.health,
      warning: scopeWarnings[0],
      warnings: scopeWarnings,
      ...liveResult,
      sources: {
        stores: "live-artifacts",
        pricing: buildSourcesLabel(liveProducts),
        taxes: "seeded-pricing-rules",
      },
    };
  }

  const demoResult = compareStoreCatalog({
    stores: demoStores,
    products: mapDemoBasketProducts(),
    pricingRules,
    userLocation: request.location,
    radiusMiles: request.radiusMiles,
    shoppingList: request.shoppingList,
    openNowOnly: request.openNowOnly,
  });

  return {
    generatedAt: nowIso(),
    providerModeRequested: providerMode,
    providerModeResolved: "demo",
    liveDataHealth: liveArtifacts.health,
    warning:
      providerMode === "auto" && !liveArtifacts.health.usable
        ? liveArtifacts.health.warning ??
          "Live data is unavailable, so CartPrice is using demo data for comparison."
        : undefined,
    warnings:
      providerMode === "auto" && !liveArtifacts.health.usable
        ? [
            liveArtifacts.health.warning ??
              "Live data is unavailable, so CartPrice is using demo data for comparison.",
          ]
        : [],
    ...demoResult,
    sources: {
      stores: "seeded-demo-data",
      pricing: ["seeded-demo-data"],
      taxes: "seeded-pricing-rules",
    },
  };
}

export async function buildCoreBasketComparison(params: {
  zipCode: string;
  providerMode?: ComparisonProviderMode;
  radiusMiles?: number;
  openNowOnly?: boolean;
}) {
  const shoppingList = await loadCoreBasketAsShoppingList();
  return buildComparison(
    {
      shoppingList,
      location: resolveZipCoordinates(params.zipCode),
      radiusMiles: params.radiusMiles ?? 15,
      openNowOnly: params.openNowOnly ?? false,
    },
    {
      providerMode: params.providerMode ?? "auto",
    },
  );
}

export async function writeLatestBasketComparison(result: UnifiedComparisonResponse) {
  await fs.mkdir(path.dirname(artifactFiles.comparison), { recursive: true });
  await fs.writeFile(artifactFiles.comparison, JSON.stringify(result, null, 2));
  return artifactFiles.comparison;
}

export async function getCurrentComparisonArchitecture() {
  const liveDataHealth = await getLiveComparisonDataHealth();
  return {
    comparisonEngine: "shared-comparison-domain",
    providerModes: ["demo", "live", "auto"],
    demoCatalog: {
      stores: demoStores.length,
      products: demoProducts.length,
    },
    liveArtifacts: liveDataHealth,
  } as const;
}
