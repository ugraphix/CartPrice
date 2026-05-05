import { nowIso, normalizeText } from "./utils.mjs";

export function normalizeUnit(rawUnit) {
  const unit = normalizeText(rawUnit);
  if (!unit) return undefined;
  if (["oz", "ounce", "ounces"].includes(unit)) return "oz";
  if (["lb", "pound", "pounds"].includes(unit)) return "lb";
  if (["ct", "count"].includes(unit)) return "ct";
  if (["gal", "gallon", "gallons"].includes(unit)) return "gal";
  return rawUnit;
}

export function buildNormalizedProductShape(product) {
  return {
    source: product.source,
    retailer: product.retailer,
    storeId: product.storeId,
    storeName: product.storeName,
    productId: product.productId,
    sku: product.sku,
    upc: product.upc,
    name: product.name,
    brand: product.brand,
    size: product.size,
    unit: normalizeUnit(product.unit),
    category: product.category,
    imageUrl: product.imageUrl,
    productUrl: product.productUrl,
    price: product.price,
    regularPrice: product.regularPrice,
    salePrice: product.salePrice,
    unitPrice: product.unitPrice,
    currency: product.currency ?? "USD",
    availability: product.availability ?? "unknown",
    fulfillmentModes: product.fulfillmentModes ?? [],
    lastSeenAt: product.lastSeenAt ?? nowIso(),
    priceUpdatedAt: product.priceUpdatedAt ?? nowIso(),
    sourceUrl: product.sourceUrl,
    raw: product.raw,
  };
}
