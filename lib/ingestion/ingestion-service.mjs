import { createAdapter } from "./adapters.mjs";
import { loadCoreBasket, outputFiles } from "./config.mjs";
import { createSourceError, ErrorTypes } from "./errors.mjs";
import { getExpiryIso, getTtlHoursForBasketItem } from "./freshness-policy.mjs";
import { appendCollection, readCollection, upsertById, writeJson, writeRunArtifacts } from "./json-store.mjs";
import { matchProducts } from "./matching.mjs";
import { checkRobotsAllowed } from "./robots.mjs";
import { listEnabledSources, getSourceRegistry } from "./source-registry.mjs";
import { discoverStoresByZip } from "./store-discovery.mjs";
import { createId, normalizeText, nowIso, uniqueBy } from "./utils.mjs";

function mapKrogerStore(rawStore, retailerSourceId) {
  return {
    id: `${retailerSourceId}_${rawStore.locationId}`,
    retailerSourceId,
    externalStoreCode: rawStore.locationId,
    name: rawStore.name,
    zipCode: rawStore.address?.zipCode ?? null,
    city: rawStore.address?.city ?? null,
    stateCode: rawStore.address?.state ?? null,
    latitude: rawStore.geolocation?.latitude ?? null,
    longitude: rawStore.geolocation?.longitude ?? null,
    observedAt: nowIso(),
    sourceUrl: "https://api.kroger.com/v1/locations",
    raw: rawStore,
  };
}

function buildHistoricalPriceRecord(product, basketItem = null) {
  const observedAt = nowIso();
  return {
    id: createId("price_obs"),
    product_id: product.productId,
    retailer: product.retailer,
    store_id: product.storeId,
    price: product.price,
    regular_price: product.regularPrice,
    sale_price: product.salePrice,
    unit_price: product.unitPrice,
    currency: product.currency,
    source_url: product.sourceUrl,
    observed_at: observedAt,
    expires_at: getExpiryIso(observedAt, basketItem ? getTtlHoursForBasketItem(basketItem) : 24),
    confidence_score: product.price == null ? 0.2 : 0.95,
  };
}

function buildAvailabilityRecord(product) {
  return {
    id: createId("availability_obs"),
    product_id: product.productId,
    retailer: product.retailer,
    store_id: product.storeId,
    availability: product.availability,
    fulfillment_modes: product.fulfillmentModes,
    source_url: product.sourceUrl,
    observed_at: nowIso(),
  };
}

function trimRawForDisk(product) {
  return {
    ...product,
    raw: product.raw,
  };
}

async function ingestKrogerStoresForZip(sourceId, zipCode) {
  const adapter = await createAdapter(sourceId);
  const response = await adapter.searchLocations({ zipCode });
  return response.stores.map((store) => mapKrogerStore(store, sourceId));
}

export async function validateSources({ enabledOnly = true } = {}) {
  const sources = (await getSourceRegistry()).filter((source) => (enabledOnly ? source.enabled : true));
  const results = [];
  const errors = [];
  const warnings = [];

  for (const source of sources) {
    try {
      if (source.type === "scrape") {
        const robots = await checkRobotsAllowed(source.baseUrl);
        results.push({
          sourceId: source.id,
          retailerName: source.retailerName,
          type: source.type,
          enabled: source.enabled,
          allowed: robots.allowed,
          details: robots,
        });
        if (!robots.allowed) {
          errors.push(createSourceError(ErrorTypes.blockedByRobots, source.id, { robots }));
        }
        continue;
      }

      if (source.type === "api" && ["kroger", "qfc", "fred-meyer"].includes(source.id)) {
        const adapter = await createAdapter(source.id);
        const validation = await adapter.validateSourceAccess();
        if (validation.reason === "missing_credentials") {
          warnings.push({
            sourceId: source.id,
            message: "Kroger credentials not set. Live ingestion will fail.",
            env: validation.env,
          });
        }
        results.push({
          sourceId: source.id,
          retailerName: source.retailerName,
          type: source.type,
          enabled: source.enabled,
          allowed: validation.ok,
          details: validation,
        });
        if (!validation.ok) {
          errors.push(createSourceError(ErrorTypes.invalidResponse, source.id, { validation }));
        }
        continue;
      }

      results.push({
        sourceId: source.id,
        retailerName: source.retailerName,
        type: source.type,
        enabled: source.enabled,
        allowed: true,
        details: { reason: "manual_validation_required" },
      });
    } catch (error) {
      results.push({
        sourceId: source.id,
        retailerName: source.retailerName,
        type: source.type,
        enabled: source.enabled,
        allowed: false,
        details: {
          reason: "validation_failed",
          message: error.message,
        },
      });
      errors.push(createSourceError(ErrorTypes.invalidResponse, source.id, {
        message: error.message,
      }));
    }
  }

  const report = {
    generatedAt: nowIso(),
    count: results.length,
    results,
    warnings,
  };

  await writeJson(outputFiles.sourceErrors, {
    generatedAt: nowIso(),
    count: errors.length,
    errors,
  });
  if (errors.length > 0) {
    await appendCollection(outputFiles.errorsDb, errors);
  }

  return report;
}

export async function ingestStores({ zipCode }) {
  const run = {
    id: createId("run"),
    command: "ingest:stores",
    zipCode,
    startedAt: nowIso(),
    status: "running",
  };

  const errors = [];
  const osmStores = await discoverStoresByZip({ zipCode });
  let krogerStores = [];

  for (const sourceId of ["kroger", "qfc", "fred-meyer"]) {
    try {
      const stores = await ingestKrogerStoresForZip(sourceId, zipCode);
      krogerStores.push(...stores);
    } catch (error) {
      errors.push(
        createSourceError(ErrorTypes.invalidResponse, sourceId, {
          message: error.message,
        }),
      );
    }
  }

  const stores = uniqueBy([...osmStores, ...krogerStores], (store) => `${store.retailerSourceId}:${store.externalStoreCode ?? store.id}`);
  await upsertById(outputFiles.storesDb, stores);

  const finishedRun = {
    ...run,
    completedAt: nowIso(),
    status: errors.length > 0 ? "completed_with_errors" : "completed",
    storeCount: stores.length,
    errorCount: errors.length,
  };

  await appendCollection(outputFiles.runsDb, [finishedRun]);
  if (errors.length > 0) {
    await appendCollection(outputFiles.errorsDb, errors);
  }
  await writeRunArtifacts({
    run: finishedRun,
    products: [],
    prices: [],
    sourceErrors: errors,
    matches: [],
  });

  return {
    run: finishedRun,
    stores,
    errors,
  };
}

export async function ingestProducts({ sourceId, zipCode, query, storeId }) {
  const run = {
    id: createId("run"),
    command: "ingest:products",
    sourceId,
    zipCode,
    query,
    storeId,
    startedAt: nowIso(),
    status: "running",
  };

  const adapter = await createAdapter(sourceId);
  const errors = [];

  let resolvedStoreId = storeId;
  let resolvedStoreName = null;

  if (!resolvedStoreId && zipCode && ["kroger", "qfc", "fred-meyer"].includes(sourceId)) {
    try {
      const stores = await ingestKrogerStoresForZip(sourceId, zipCode);
      resolvedStoreId = stores[0]?.externalStoreCode ?? null;
      resolvedStoreName = stores[0]?.name ?? null;
      if (!resolvedStoreId) {
        errors.push(createSourceError(ErrorTypes.missingStoreContext, sourceId, { zipCode }));
      }
    } catch (error) {
      errors.push(createSourceError(ErrorTypes.invalidResponse, sourceId, {
        zipCode,
        message: error.message,
      }));
    }
  }

  if (!resolvedStoreId) {
    const finishedRun = {
      ...run,
      completedAt: nowIso(),
      status: "failed",
      errorCount: errors.length,
    };
    await appendCollection(outputFiles.runsDb, [finishedRun]);
    if (errors.length > 0) {
      await appendCollection(outputFiles.errorsDb, errors);
    }
    await writeRunArtifacts({
      run: finishedRun,
      products: [],
      prices: [],
      sourceErrors: errors,
      matches: [],
    });
    return { run: finishedRun, products: [], prices: [], errors };
  }

  let response;
  try {
    response = await adapter.searchProducts({
      query,
      storeId: resolvedStoreId,
      zipCode,
    });
  } catch (error) {
    errors.push(createSourceError(ErrorTypes.invalidResponse, sourceId, {
      query,
      storeId: resolvedStoreId,
      message: error.message,
    }));
    const finishedRun = {
      ...run,
      completedAt: nowIso(),
      status: "failed",
      errorCount: errors.length,
    };
    await appendCollection(outputFiles.runsDb, [finishedRun]);
    await appendCollection(outputFiles.errorsDb, errors);
    await writeRunArtifacts({
      run: finishedRun,
      products: [],
      prices: [],
      sourceErrors: errors,
      matches: [],
    });
    return { run: finishedRun, products: [], prices: [], errors };
  }

  const products = response.products.map((rawProduct) =>
    trimRawForDisk(
      adapter.normalizeProduct(rawProduct, {
        retailer: sourceId === "kroger" ? "Kroger" : sourceId === "qfc" ? "QFC" : "Fred Meyer",
        storeId: resolvedStoreId,
        storeName: resolvedStoreName,
        sourceUrl: response.sourceUrl,
      }),
    ),
  );

  const priceRecords = products.map((product) => buildHistoricalPriceRecord(product));
  const availabilityRecords = products.map((product) => buildAvailabilityRecord(product));
  const matchRecords = matchProducts(products);

  await Promise.all([
    upsertById(outputFiles.productsDb, products.map((product) => ({
      id: product.productId,
      retailer_source_id: sourceId,
      store_id: product.storeId,
      canonical_brand: product.brand,
      canonical_name: product.name,
      normalized_name: normalizeText(`${product.brand} ${product.name} ${product.size ?? ""}`),
      category: product.category,
      variant: product.size,
      size_text: product.size,
      image_url: product.imageUrl,
      product_url: product.productUrl,
      last_seen_at: product.lastSeenAt,
      raw: product.raw,
    }))),
    appendCollection(outputFiles.pricesDb, priceRecords),
    appendCollection(outputFiles.availabilityDb, availabilityRecords),
    appendCollection(outputFiles.matchesDb, matchRecords),
  ]);

  const finishedRun = {
    ...run,
    completedAt: nowIso(),
    status: "completed",
    productCount: products.length,
    errorCount: errors.length,
  };

  await appendCollection(outputFiles.runsDb, [finishedRun]);
  if (errors.length > 0) {
    await appendCollection(outputFiles.errorsDb, errors);
  }
  await writeRunArtifacts({
    run: finishedRun,
    products,
    prices: priceRecords,
    sourceErrors: errors,
    matches: matchRecords,
  });

  return {
    run: finishedRun,
    products,
    prices: priceRecords,
    errors,
    matches: matchRecords,
  };
}

export async function ingestBasket({ zipCode, sourceIds = ["qfc", "fred-meyer"] }) {
  const run = {
    id: createId("run"),
    command: "ingest:basket",
    zipCode,
    sourceIds,
    startedAt: nowIso(),
    status: "running",
  };

  const basket = await loadCoreBasket();
  const allProducts = [];
  const allPrices = [];
  const allMatches = [];
  const allErrors = [];

  for (const sourceId of sourceIds) {
    let storeContext = null;
    try {
      const stores = await ingestKrogerStoresForZip(sourceId, zipCode);
      storeContext = stores[0] ?? null;
      if (!storeContext) {
        allErrors.push(createSourceError(ErrorTypes.missingStoreContext, sourceId, { zipCode }));
        continue;
      }
      await upsertById(outputFiles.storesDb, [storeContext]);
    } catch (error) {
      allErrors.push(createSourceError(ErrorTypes.invalidResponse, sourceId, { message: error.message }));
      continue;
    }

    const adapter = await createAdapter(sourceId);
    for (const basketItem of basket) {
      try {
        const response = await adapter.searchProducts({
          query: basketItem.query,
          storeId: storeContext.externalStoreCode,
          zipCode,
        });

        const products = response.products.map((rawProduct) =>
          adapter.normalizeProduct(rawProduct, {
            retailer: sourceId === "qfc" ? "QFC" : sourceId === "fred-meyer" ? "Fred Meyer" : "Kroger",
            storeId: storeContext.externalStoreCode,
            storeName: storeContext.name,
            sourceUrl: response.sourceUrl,
          }),
        );

        const topProduct = products[0];
        if (!topProduct || topProduct.price == null) {
          allErrors.push(
            createSourceError(ErrorTypes.missingPrice, sourceId, {
              query: basketItem.query,
              storeId: storeContext.externalStoreCode,
            }),
          );
          continue;
        }

        const priceRecord = buildHistoricalPriceRecord(topProduct, basketItem);
        const availabilityRecord = buildAvailabilityRecord(topProduct);

        allProducts.push(trimRawForDisk(topProduct));
        allPrices.push(priceRecord);

        await Promise.all([
          upsertById(outputFiles.productsDb, [{
            id: topProduct.productId,
            retailer_source_id: sourceId,
            store_id: topProduct.storeId,
            canonical_brand: topProduct.brand,
            canonical_name: topProduct.name,
            normalized_name: normalizeText(`${topProduct.brand} ${topProduct.name} ${topProduct.size ?? ""}`),
            category: topProduct.category,
            variant: topProduct.size,
            size_text: topProduct.size,
            image_url: topProduct.imageUrl,
            product_url: topProduct.productUrl,
            last_seen_at: topProduct.lastSeenAt,
            basket_item_id: basketItem.id,
            raw: topProduct.raw,
          }]),
          appendCollection(outputFiles.pricesDb, [priceRecord]),
          appendCollection(outputFiles.availabilityDb, [availabilityRecord]),
        ]);
      } catch (error) {
        allErrors.push(createSourceError(ErrorTypes.invalidResponse, sourceId, {
          query: basketItem.query,
          message: error.message,
        }));
      }
    }
  }

  const matches = matchProducts(allProducts);
  allMatches.push(...matches);
  await appendCollection(outputFiles.matchesDb, matches);

  const finishedRun = {
    ...run,
    completedAt: nowIso(),
    status: allErrors.length > 0 ? "completed_with_errors" : "completed",
    productCount: allProducts.length,
    priceCount: allPrices.length,
    errorCount: allErrors.length,
  };

  await appendCollection(outputFiles.runsDb, [finishedRun]);
  if (allErrors.length > 0) {
    await appendCollection(outputFiles.errorsDb, allErrors);
  }
  await writeRunArtifacts({
    run: finishedRun,
    products: allProducts,
    prices: allPrices,
    sourceErrors: allErrors,
    matches: allMatches,
  });

  return {
    run: finishedRun,
    products: allProducts,
    prices: allPrices,
    errors: allErrors,
    matches: allMatches,
  };
}

export async function refreshPrices() {
  const run = {
    id: createId("run"),
    command: "refresh:prices",
    startedAt: nowIso(),
    status: "running",
  };

  const priceRecords = await readCollection(outputFiles.pricesDb);
  const productRecords = await readCollection(outputFiles.productsDb);
  const latestByProduct = new Map();
  for (const record of priceRecords) {
    const previous = latestByProduct.get(record.product_id);
    if (!previous || previous.observed_at < record.observed_at) {
      latestByProduct.set(record.product_id, record);
    }
  }

  const staleProducts = productRecords.filter((product) => {
    const latest = latestByProduct.get(product.id);
    if (!latest?.expires_at) return true;
    return new Date(latest.expires_at).getTime() <= Date.now();
  });

  const refreshPlan = staleProducts.map((product) => ({
    productId: product.id,
    retailerSourceId: product.retailer_source_id,
    storeId: product.store_id,
    reason: "ttl_expired",
  }));

  const finishedRun = {
    ...run,
    completedAt: nowIso(),
    status: "completed",
    staleProductCount: staleProducts.length,
  };

  await appendCollection(outputFiles.runsDb, [finishedRun]);
  await writeRunArtifacts({
    run: {
      ...finishedRun,
      refreshPlan,
    },
    products: staleProducts,
    prices: [],
    sourceErrors: [],
    matches: [],
  });

  return {
    run: finishedRun,
    refreshPlan,
  };
}

export async function matchExistingProducts() {
  const products = await readCollection(outputFiles.productsDb);
  const normalizedProducts = products.map((product) => ({
    source: product.retailer_source_id,
    retailer: product.retailer_source_id,
    storeId: product.store_id,
    productId: product.id,
    upc: product.upc,
    brand: product.canonical_brand,
    name: product.canonical_name,
    size: product.size_text,
  }));
  const matches = matchProducts(normalizedProducts);
  await appendCollection(outputFiles.matchesDb, matches);
  await writeJson(outputFiles.productMatches, {
    generatedAt: nowIso(),
    count: matches.length,
    matches,
  });
  return matches;
}

export async function listSourceSummary() {
  const sources = await listEnabledSources();
  return sources.map((source) => ({
    id: source.id,
    retailerName: source.retailerName,
    type: source.type,
    enabled: source.enabled,
  }));
}
