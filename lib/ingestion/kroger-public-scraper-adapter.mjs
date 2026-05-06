import * as cheerio from "cheerio";
import { BaseSourceAdapter } from "./adapter-contract.mjs";
import { buildNormalizedProductShape } from "./normalization.mjs";
import { checkRobotsAllowed } from "./robots.mjs";
import { fetchWithPolicy } from "./http-client.mjs";
import { createId, normalizeText, nowIso, stableHash } from "./utils.mjs";

const PRODUCT_WORDS = new Set([
  "milk",
  "vitamin",
  "reduced",
  "whole",
  "skim",
  "lowfat",
  "lactose",
  "free",
  "high",
  "protein",
  "fat",
  "chocolate",
  "ultra-filtered",
  "organic",
  "half",
  "gallon",
]);

function collapseWhitespace(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(value) {
  const match = String(value ?? "").match(/\$(\d+(?:\.\d{2})?)/);
  return match ? Number(match[1]) : null;
}

function parseUnitPrice(text) {
  const match = collapseWhitespace(text).match(/\$(\d+(?:\.\d{2})?)\s*\/\s*([a-z ]+)/i);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function parsePriceFields(text) {
  const collapsed = collapseWhitespace(text);
  const discountedMatch = collapsed.match(/\$(\d+(?:\.\d{2})?)\s+discounted from.*?\$(\d+(?:\.\d{2})?)/i);
  if (discountedMatch) {
    return {
      price: Number(discountedMatch[1]),
      regularPrice: Number(discountedMatch[2]),
      salePrice: Number(discountedMatch[1]),
    };
  }

  const priceMatches = [...collapsed.matchAll(/\$(\d+(?:\.\d{2})?)(?!\s*\/)/g)].map((match) => Number(match[1]));
  const price = priceMatches[0] ?? null;
  return {
    price,
    regularPrice: price,
    salePrice: null,
  };
}

function parseAvailability(text) {
  const collapsed = collapseWhitespace(text).toLowerCase();
  if (collapsed.includes("out of stock") || collapsed.includes("sold out")) {
    return "out_of_stock";
  }
  if (collapsed.includes("low stock")) {
    return "low_stock";
  }
  if (collapsed.includes("in stock")) {
    return "in_stock";
  }
  return "unknown";
}

function parseSize(text) {
  const match = collapseWhitespace(text).match(/\b((?:\d+\/\d+|\d+(?:\.\d+)?)\s?(?:gal|gallon|fl oz|oz|lb|ct|count|pk|pack))\b/i);
  return match ? match[1] : null;
}

function inferBrand(name) {
  const cleaned = collapseWhitespace(name).replace(/[®™]/g, "");
  if (!cleaned) {
    return null;
  }

  const commaPrefix = cleaned.split(",")[0]?.trim();
  const tokens = commaPrefix.split(" ").filter(Boolean);
  const brandTokens = [];

  for (const token of tokens) {
    const normalized = normalizeText(token);
    if (!normalized) {
      continue;
    }
    if (/^\d/.test(token)) {
      break;
    }
    if (brandTokens.length > 0 && PRODUCT_WORDS.has(normalized)) {
      break;
    }
    brandTokens.push(token);
  }

  const brand = brandTokens.join(" ").trim();
  return brand || null;
}

function extractProductId(productUrl) {
  if (!productUrl) {
    return createId("kroger_public_product");
  }
  const match = productUrl.match(/\/p\/[^/]+\/(\d+)/i);
  return match?.[1] ?? createId("kroger_public_product");
}

function normalizeProductUrl(href) {
  if (!href) {
    return null;
  }
  return new URL(href, "https://www.kroger.com").toString();
}

function findProductContainer($, anchor) {
  let current = anchor;
  for (let depth = 0; depth < 7 && current.length > 0; depth += 1) {
    const text = collapseWhitespace(current.text());
    if (text.includes(collapseWhitespace(anchor.text())) && /\$\d/.test(text) && text.length <= 450) {
      return current;
    }
    current = current.parent();
  }
  return anchor.parent();
}

function parseSelectedStore($) {
  const lines = $("body")
    .text()
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const pickupIndex = lines.findIndex((line) => /^pickup at\b/i.test(line));
  if (pickupIndex === -1) {
    return null;
  }

  const name = lines[pickupIndex].replace(/^pickup at\s*/i, "").trim();
  const addressLine = lines[pickupIndex + 1]?.replace(/^\|\s*/, "").trim() ?? null;
  const label = [name, addressLine].filter(Boolean).join(" | ");
  return {
    storeId: label ? `public_store_${stableHash(label).slice(0, 12)}` : null,
    name: name || null,
    address: addressLine,
    label: label || null,
  };
}

function parseSearchProducts(html, sourceUrl) {
  const $ = cheerio.load(html);
  const selectedStore = parseSelectedStore($);
  const anchors = $("a[href*='/p/']").toArray();
  const seen = new Set();
  const products = [];

  for (const node of anchors) {
    const anchor = $(node);
    const href = anchor.attr("href");
    const productUrl = normalizeProductUrl(href);
    if (!productUrl || seen.has(productUrl)) {
      continue;
    }
    seen.add(productUrl);

    const name = collapseWhitespace(anchor.text());
    if (!name) {
      continue;
    }

    const container = findProductContainer($, anchor);
    const text = collapseWhitespace(container.text());
    const { price, regularPrice, salePrice } = parsePriceFields(text);
    const unitPrice = parseUnitPrice(text);
    const size = parseSize(text);
    const availability = parseAvailability(text);

    products.push({
      productId: extractProductId(productUrl),
      name,
      brand: inferBrand(name),
      size,
      price,
      regularPrice,
      salePrice,
      unitPrice,
      availability,
      productUrl,
      observedAt: nowIso(),
      sourceId: "kroger-public",
      sourceUrl,
      selectedStore,
      rawText: text,
    });
  }

  return {
    selectedStore,
    products,
  };
}

function parseProductDetail(html, productUrl, selectedStore = null) {
  const $ = cheerio.load(html);
  const bodyText = collapseWhitespace($("body").text());
  const heading = collapseWhitespace($("h1").first().text())
    || collapseWhitespace($("title").first().text()).replace(/\s*\|\s*Kroger.*$/i, "");

  if (!heading) {
    return null;
  }

  const { price, regularPrice, salePrice } = parsePriceFields(bodyText);
  return {
    productId: extractProductId(productUrl),
    name: heading,
    brand: inferBrand(heading),
    size: parseSize(bodyText),
    price,
    regularPrice,
    salePrice,
    unitPrice: parseUnitPrice(bodyText),
    availability: parseAvailability(bodyText),
    productUrl,
    observedAt: nowIso(),
    sourceId: "kroger-public",
    sourceUrl: productUrl,
    selectedStore,
    rawText: bodyText,
  };
}

export class KrogerPublicScraperAdapter extends BaseSourceAdapter {
  getRateLimitPolicy() {
    return {
      requestsPerSecond: 0.5,
      minDelayMs: 2000,
    };
  }

  async validateSourceAccess() {
    const searchUrl = "https://www.kroger.com/q/milk";
    const productUrl = "https://www.kroger.com/p/test-product/0000000000000";
    const [searchRobots, productRobots] = await Promise.all([
      checkRobotsAllowed(searchUrl),
      checkRobotsAllowed(productUrl),
    ]);

    const ok = searchRobots.allowed && productRobots.allowed;
    return {
      ok,
      sourceId: this.source.id,
      searchRobots,
      productRobots,
      reason: ok ? "crawlable" : "blocked_by_robots",
      message: ok
        ? "Public Kroger search and product paths appear crawlable."
        : searchRobots.blockedRule === "robots_unavailable" || productRobots.blockedRule === "robots_unavailable"
          ? "Public Kroger scraping stopped because robots.txt could not be verified from this environment."
          : "Public Kroger scraping blocked by robots.txt.",
    };
  }

  async searchProducts({ query, zipCode }) {
    const searchUrl = `https://www.kroger.com/q/${encodeURIComponent(query)}`;
    const searchRobots = await checkRobotsAllowed(searchUrl);
    if (!searchRobots.allowed) {
      if (searchRobots.blockedRule === "robots_unavailable") {
        throw new Error("Kroger public scraping stopped: unable to verify robots.txt from this environment.");
      }
      throw new Error(`Kroger public scraping stopped: robots.txt disallows ${new URL(searchUrl).pathname}.`);
    }

    const response = await fetchWithPolicy(searchUrl, {
      minDelayMs: this.getRateLimitPolicy().minDelayMs,
      cacheTtlMs: 1000 * 60 * 30,
      headers: {
        accept: "text/html,application/xhtml+xml",
      },
    });

    const parsedSearch = parseSearchProducts(response.body, searchUrl);
    let products = parsedSearch.products;

    if (products.length === 0) {
      throw new Error("No usable public Kroger product cards were found on the search page.");
    }

    const hasVisiblePrice = products.some((product) => product.price != null);
    const hasVisibleAvailability = products.some((product) => product.availability !== "unknown");

    if ((!hasVisiblePrice || !hasVisibleAvailability) && products[0]?.productUrl) {
      const pdpRobots = await checkRobotsAllowed(products[0].productUrl);
      if (pdpRobots.allowed) {
        const detailResponse = await fetchWithPolicy(products[0].productUrl, {
          minDelayMs: this.getRateLimitPolicy().minDelayMs,
          cacheTtlMs: 1000 * 60 * 30,
          headers: {
            accept: "text/html,application/xhtml+xml",
          },
        });
        const detail = parseProductDetail(
          detailResponse.body,
          products[0].productUrl,
          parsedSearch.selectedStore,
        );
        if (detail) {
          products = [
            { ...products[0], ...detail },
            ...products.slice(1),
          ];
        }
      }
    }

    return {
      source: this.source.id,
      query,
      zipCode,
      products,
      sourceUrl: searchUrl,
      fetchedAt: response.fetchedAt,
      selectedStore: parsedSearch.selectedStore,
    };
  }

  async getProductDetails({ productUrl }) {
    if (!productUrl) {
      throw new Error("Kroger public scraper requires productUrl for getProductDetails().");
    }
    const robots = await checkRobotsAllowed(productUrl);
    if (!robots.allowed) {
      if (robots.blockedRule === "robots_unavailable") {
        throw new Error("Kroger public scraping stopped: unable to verify robots.txt from this environment.");
      }
      throw new Error(`Kroger public scraping stopped: robots.txt disallows ${new URL(productUrl).pathname}.`);
    }

    const response = await fetchWithPolicy(productUrl, {
      minDelayMs: this.getRateLimitPolicy().minDelayMs,
      cacheTtlMs: 1000 * 60 * 30,
      headers: {
        accept: "text/html,application/xhtml+xml",
      },
    });

    const product = parseProductDetail(response.body, productUrl);
    return {
      product,
      sourceUrl: productUrl,
      fetchedAt: response.fetchedAt,
    };
  }

  normalizeProduct(rawProduct, context = {}) {
    const selectedStore = rawProduct.selectedStore ?? null;
    return buildNormalizedProductShape({
      source: rawProduct.sourceId ?? this.source.id,
      retailer: context.retailer ?? this.source.retailerName,
      pricingScope: "unknown",
      storeId: rawProduct.storeId ?? context.storeId ?? selectedStore?.storeId ?? null,
      storeName: rawProduct.storeName ?? context.storeName ?? selectedStore?.name ?? null,
      productId: rawProduct.productId ?? createId("kroger_public_product"),
      sku: rawProduct.productId ?? null,
      upc: rawProduct.productId ?? null,
      name: rawProduct.name ?? "Unknown Product",
      brand: rawProduct.brand ?? "Unknown Brand",
      size: rawProduct.size ?? null,
      unit: null,
      category: "grocery",
      imageUrl: null,
      productUrl: rawProduct.productUrl ?? null,
      price: rawProduct.price ?? null,
      regularPrice: rawProduct.regularPrice ?? rawProduct.price ?? null,
      salePrice: rawProduct.salePrice ?? null,
      unitPrice: rawProduct.unitPrice ?? null,
      currency: "USD",
      availability: rawProduct.availability ?? "unknown",
      fulfillmentModes: [],
      lastSeenAt: rawProduct.observedAt ?? nowIso(),
      priceUpdatedAt: rawProduct.observedAt ?? nowIso(),
      sourceUrl: rawProduct.sourceUrl ?? context.sourceUrl ?? null,
      raw: rawProduct,
    });
  }
}
