import { BaseSourceAdapter } from "./adapter-contract.mjs";
import { ErrorTypes } from "./errors.mjs";
import { HttpError, fetchWithPolicy } from "./http-client.mjs";
import { buildNormalizedProductShape } from "./normalization.mjs";
import { createId, nowIso } from "./utils.mjs";

const krogerConfig = {
  clientId: process.env.KROGER_CLIENT_ID?.trim(),
  clientSecret: process.env.KROGER_CLIENT_SECRET?.trim(),
};

const tokenCache = {
  accessToken: null,
  expiresAt: null,
};

async function getAccessToken() {
  if (tokenCache.accessToken && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  if (!krogerConfig.clientId || !krogerConfig.clientSecret) {
    throw new Error("Missing KROGER_CLIENT_ID or KROGER_CLIENT_SECRET");
  }

  const credentials = Buffer.from(
    `${krogerConfig.clientId}:${krogerConfig.clientSecret}`,
  ).toString("base64");

  const response = await fetchWithPolicy("https://api.kroger.com/v1/connect/oauth2/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=product.compact",
    minDelayMs: 800,
    retries: 1,
  });

  tokenCache.accessToken = response.body.access_token;
  tokenCache.expiresAt = Date.now() + (response.body.expires_in - 60) * 1000;
  return tokenCache.accessToken;
}

function inferAvailability(rawItem) {
  const stockLevel = rawItem?.items?.[0]?.inventory?.stockLevel;
  if (typeof stockLevel === "string") return stockLevel;
  if (typeof stockLevel === "number") return stockLevel > 0 ? "in_stock" : "out_of_stock";
  return "unknown";
}

export class KrogerAdapter extends BaseSourceAdapter {
  getRateLimitPolicy() {
    return {
      documentedLimit: "10,000 calls per day",
      requestsPerSecond: 2,
      minDelayMs: 600,
    };
  }

  async validateSourceAccess() {
    if (!krogerConfig.clientId || !krogerConfig.clientSecret) {
      return {
        ok: false,
        sourceId: this.source.id,
        reason: "missing_credentials",
      };
    }

    try {
      await getAccessToken();
      return {
        ok: true,
        sourceId: this.source.id,
      };
    } catch (error) {
      return {
        ok: false,
        sourceId: this.source.id,
        reason: "token_request_failed",
        details: error.message,
      };
    }
  }

  async searchLocations({ zipCode, limit = 6 }) {
    const accessToken = await getAccessToken();
    const params = new URLSearchParams({
      "filter.zipCode.near": zipCode,
      "filter.limit": String(limit),
    });

    const response = await fetchWithPolicy(`https://api.kroger.com/v1/locations?${params}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      minDelayMs: this.getRateLimitPolicy().minDelayMs,
      cacheTtlMs: 1000 * 60 * 60 * 6,
    });

    return {
      source: this.source.id,
      zipCode,
      stores: response.body.data ?? [],
      sourceUrl: `https://api.kroger.com/v1/locations?${params}`,
      fetchedAt: response.fetchedAt,
    };
  }

  async searchProducts({ query, storeId, zipCode }) {
    if (!storeId && !zipCode) {
      throw new Error("Kroger product search requires storeId or zipCode context.");
    }

    const accessToken = await getAccessToken();
    const params = new URLSearchParams({
      "filter.term": query,
      "filter.limit": "10",
    });
    if (storeId) {
      params.set("filter.locationId", storeId);
    }

    try {
      const response = await fetchWithPolicy(`https://api.kroger.com/v1/products?${params}`, {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        minDelayMs: this.getRateLimitPolicy().minDelayMs,
        cacheTtlMs: 1000 * 60 * 30,
      });

      return {
        source: this.source.id,
        query,
        storeId,
        zipCode,
        products: response.body.data ?? [],
        sourceUrl: `https://api.kroger.com/v1/products?${params}`,
        fetchedAt: response.fetchedAt,
      };
    } catch (error) {
      if (error instanceof HttpError && error.details.status === 429) {
        error.classification = ErrorTypes.apiLimitReached;
      }
      throw error;
    }
  }

  async getProductDetails({ productId, storeId }) {
    const accessToken = await getAccessToken();
    const params = new URLSearchParams({
      "filter.productId": productId,
    });
    if (storeId) params.set("filter.locationId", storeId);

    const response = await fetchWithPolicy(`https://api.kroger.com/v1/products/${productId}?${params}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      minDelayMs: this.getRateLimitPolicy().minDelayMs,
      cacheTtlMs: 1000 * 60 * 60,
    });

    return {
      product: response.body.data,
      sourceUrl: `https://api.kroger.com/v1/products/${productId}?${params}`,
      fetchedAt: response.fetchedAt,
    };
  }

  normalizeProduct(rawProduct, context = {}) {
    const item = rawProduct.items?.find((candidate) => !context.storeId || candidate.locationId === context.storeId)
      ?? rawProduct.items?.[0];
    const price = item?.price?.promo ?? item?.price?.regular ?? null;

    return buildNormalizedProductShape({
      source: this.source.id,
      retailer: context.retailer ?? this.source.retailerName,
      storeId: item?.locationId ?? context.storeId ?? null,
      storeName: context.storeName ?? null,
      productId: rawProduct.productId ?? createId("kroger_product"),
      sku: item?.itemId ?? null,
      upc: rawProduct.upc ?? null,
      name: rawProduct.description ?? rawProduct.brand ?? "Unknown Product",
      brand: rawProduct.brand ?? "Unknown Brand",
      size: item?.size ?? rawProduct.size ?? null,
      unit: item?.soldBy ?? null,
      category: rawProduct.categories?.[0] ?? "uncategorized",
      imageUrl: rawProduct.images?.[0]?.sizes?.find((sizeOption) => sizeOption.size === "medium")?.url
        ?? rawProduct.images?.[0]?.sizes?.[0]?.url
        ?? null,
      productUrl: context.sourceUrl ?? null,
      price,
      regularPrice: item?.price?.regular ?? null,
      salePrice: item?.price?.promo ?? null,
      unitPrice: item?.price?.regular ?? null,
      currency: "USD",
      availability: inferAvailability(rawProduct),
      fulfillmentModes: item?.fulfillment?.map((entry) => entry.fulfillmentType) ?? [],
      lastSeenAt: nowIso(),
      priceUpdatedAt: nowIso(),
      sourceUrl: context.sourceUrl ?? null,
      raw: rawProduct,
    });
  }
}
