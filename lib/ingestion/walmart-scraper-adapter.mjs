import * as cheerio from "cheerio";
import { BaseSourceAdapter } from "./adapter-contract.mjs";
import { buildNormalizedProductShape } from "./normalization.mjs";
import { checkRobotsAllowed } from "./robots.mjs";
import { createId, nowIso } from "./utils.mjs";
import { fetchWithPolicy } from "./http-client.mjs";

function parsePriceFromText(value) {
  if (!value) {
    return null;
  }
  const normalized = String(value).replace(/,/g, "");
  const match = normalized.match(/\$?\s*(\d+(?:\.\d{2})?)/);
  return match ? Number(match[1]) : null;
}

function extractProductId(productUrl) {
  if (!productUrl) {
    return createId("walmart_product");
  }
  const match = productUrl.match(/\/ip\/(?:[^/]+\/)?(\d+)/);
  return match?.[1] ?? createId("walmart_product");
}

function extractSize(name, fallbackText = "") {
  const combined = `${name ?? ""} ${fallbackText ?? ""}`;
  const match = combined.match(/(\d+(?:\.\d+)?)\s?(oz|lb|ct|count|gal|fl oz)\b/i);
  return match ? `${match[1]} ${match[2]}` : null;
}

function extractBrand(card) {
  const brand =
    card.attr("data-brand") ??
    card.find("[data-automation-id='product-brand']").first().text().trim() ??
    card.find("[data-testid='product-brand']").first().text().trim();
  return brand || null;
}

function collectProductCards($) {
  const selectors = [
    "[data-item-id]",
    "[data-testid='list-view'] [data-testid='item-stack']",
    "[data-testid='search-results'] [data-testid='item-stack']",
    "[data-testid='item-stack']",
  ];

  for (const selector of selectors) {
    const cards = $(selector);
    if (cards.length > 0) {
      return cards.toArray();
    }
  }

  return [];
}

function parseHtmlProducts(html, sourceUrl) {
  const $ = cheerio.load(html);
  const cards = collectProductCards($);

  return cards
    .map((node) => {
      const card = $(node);
      const productLink =
        card.find("a[href*='/ip/']").first().attr("href") ??
        card.find("a[href*='/ip']").first().attr("href") ??
        null;

      const productUrl = productLink
        ? new URL(productLink, "https://www.walmart.com").toString()
        : null;

      const name =
        card.find("[data-automation-id='product-title']").first().text().trim() ??
        card.find("[data-testid='product-title']").first().text().trim() ??
        card.find("img[alt]").first().attr("alt")?.trim() ??
        card.find("a[href*='/ip/']").first().text().trim();

      if (!name) {
        return null;
      }

      const brand = extractBrand(card);
      const wholeText = card.text();
      const size = extractSize(name, wholeText);

      const priceText =
        card.find("[itemprop='price']").first().attr("content") ??
        card.find("[data-automation-id='product-price']").first().text().trim() ??
        card.find("[data-testid='price-wrap']").first().text().trim() ??
        wholeText;

      const price = parsePriceFromText(priceText);
      const observedAt = nowIso();

      return {
        productId: extractProductId(productUrl),
        name,
        brand,
        size,
        price,
        productUrl,
        observedAt,
        sourceId: "walmart",
        sourceUrl,
      };
    })
    .filter(Boolean);
}

export class WalmartScraperAdapter extends BaseSourceAdapter {
  getRateLimitPolicy() {
    return {
      requestsPerSecond: 0.5,
      minDelayMs: 2000,
    };
  }

  async validateSourceAccess() {
    const probeUrl = "https://www.walmart.com/search?q=milk";
    const robots = await checkRobotsAllowed(probeUrl);
    if (!robots.allowed) {
      return {
        ok: false,
        sourceId: this.source.id,
        reason: "blocked_by_robots",
        message: `Walmart scraping blocked by robots.txt for ${new URL(probeUrl).pathname}.`,
        robots,
      };
    }

    return {
      ok: true,
      sourceId: this.source.id,
      robots,
    };
  }

  async searchProducts({ query, zipCode }) {
    const params = new URLSearchParams({
      q: query,
    });
    if (zipCode) {
      params.set("facet", `retailer_type:Walmart|postal_code:${zipCode}`);
    }

    const searchUrl = `https://www.walmart.com/search?${params.toString()}`;
    const robots = await checkRobotsAllowed(searchUrl);
    if (!robots.allowed) {
      throw new Error(
        `Walmart scraping stopped: robots.txt disallows ${new URL(searchUrl).pathname}.`,
      );
    }

    const response = await fetchWithPolicy(searchUrl, {
      minDelayMs: this.getRateLimitPolicy().minDelayMs,
      cacheTtlMs: 1000 * 60 * 30,
      headers: {
        accept: "text/html,application/xhtml+xml",
      },
    });

    const products = parseHtmlProducts(response.body, searchUrl);

    return {
      source: this.source.id,
      query,
      zipCode,
      products,
      sourceUrl: searchUrl,
      fetchedAt: response.fetchedAt,
    };
  }

  async getProductDetails() {
    throw new Error("Walmart scraper adapter does not implement getProductDetails().");
  }

  normalizeProduct(rawProduct, context = {}) {
    return buildNormalizedProductShape({
      source: rawProduct.sourceId ?? this.source.id,
      retailer: this.source.retailerName,
      storeId: context.storeId ?? null,
      storeName: context.storeName ?? null,
      productId: rawProduct.productId ?? createId("walmart_product"),
      sku: rawProduct.productId ?? null,
      upc: null,
      name: rawProduct.name ?? "Unknown Product",
      brand: rawProduct.brand ?? "Unknown Brand",
      size: rawProduct.size ?? null,
      unit: null,
      category: "grocery",
      imageUrl: null,
      productUrl: rawProduct.productUrl ?? null,
      price: rawProduct.price ?? null,
      regularPrice: rawProduct.price ?? null,
      salePrice: null,
      unitPrice: null,
      currency: "USD",
      availability: "unknown",
      fulfillmentModes: [],
      lastSeenAt: rawProduct.observedAt ?? nowIso(),
      priceUpdatedAt: rawProduct.observedAt ?? nowIso(),
      sourceUrl: rawProduct.sourceUrl ?? context.sourceUrl ?? null,
      raw: rawProduct,
    });
  }
}
