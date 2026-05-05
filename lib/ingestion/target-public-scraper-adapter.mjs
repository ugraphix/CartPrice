import * as cheerio from "cheerio";
import { BaseSourceAdapter } from "./adapter-contract.mjs";
import { buildNormalizedProductShape } from "./normalization.mjs";
import { checkRobotsAllowed } from "./robots.mjs";
import { fetchWithPolicy } from "./http-client.mjs";
import { createId, nowIso } from "./utils.mjs";

function collapseWhitespace(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(text) {
  const match = collapseWhitespace(text).match(/\$(\d+(?:\.\d{2})?)/);
  return match ? Number(match[1]) : null;
}

function decodeEmbeddedHtml(html) {
  return String(html ?? "")
    .replace(/\\"/g, "\"")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u2019/g, "’")
    .replace(/\\u2122/g, "™");
}

function parseAvailability(text) {
  const collapsed = collapseWhitespace(text).toLowerCase();
  if (collapsed.includes("out of stock") || collapsed.includes("sold out")) {
    return "out_of_stock";
  }
  if (collapsed.includes("limited stock") || collapsed.includes("low stock")) {
    return "low_stock";
  }
  if (collapsed.includes("in stock")) {
    return "in_stock";
  }
  return "unknown";
}

const sizePatterns = [
  /\b\d+\s?pk\s*\/\s*\d+(?:\.\d+)?\s?(?:fl oz|oz)\b/i,
  /\b\d+(?:\.\d+)?\s?(?:fl oz|oz|lb|lbs|qt|pt|gal)\b/i,
  /\b\d+\s?(?:ct|count)\b/i,
  /\b\d+\s+(?:triple|double)\s+rolls?\b/i,
  /\b\d+\s+rolls?\b/i,
  /\b\d+\s?(?:pk|pack)\b/i,
  /\b\d+\s+sheets\b/i,
  /\beach\b/i,
];

function parseStructuredContext(decodedHtml, itemId) {
  const marker = `external_system_id":"${itemId}-`;
  const index = decodedHtml.indexOf(marker);
  if (index === -1) {
    return null;
  }

  return decodedHtml.slice(Math.max(0, index - 2200), index + 1400);
}

function parseStructuredPrice(structuredContext) {
  if (!structuredContext) {
    return { price: null, regularPrice: null };
  }

  const priceBlock = structuredContext.match(
    /"price":\{[^}]*"current_retail":(\d+(?:\.\d+)?)[^}]*"reg_retail":(\d+(?:\.\d+)?)[^}]*"external_system_id":"[^"]+"/i,
  );

  if (!priceBlock) {
    return { price: null, regularPrice: null };
  }

  return {
    price: Number(priceBlock[1]),
    regularPrice: Number(priceBlock[2]),
  };
}

function extractTargetItemId(productUrl) {
  if (!productUrl) {
    return createId("target_public_product");
  }
  const match = productUrl.match(/\/A-(\d+)/i);
  return match?.[1] ?? createId("target_public_product");
}

function buildProductUrl({ productUrl, itemId }) {
  if (productUrl) {
    return productUrl;
  }
  if (itemId) {
    return `https://www.target.com/p/-/A-${itemId}`;
  }
  return null;
}

function parseBrand($, bodyText, structuredContext) {
  const structuredBrand = structuredContext?.match(/"primary_brand":\{[^}]*"name":"([^"]+)"/i)?.[1];
  if (structuredBrand) {
    return collapseWhitespace(structuredBrand).trim() || null;
  }

  const brandLink = $("a").filter((_, element) => {
    const text = collapseWhitespace($(element).text());
    return /^Shop all /i.test(text);
  }).first();

  if (brandLink.length > 0) {
    return collapseWhitespace(brandLink.text()).replace(/^Shop all /i, "").trim() || null;
  }

  const keyword = $("meta[name='keywords']").attr("content");
  if (keyword) {
    const words = collapseWhitespace(keyword).split(" ");
    if (words.length > 1) {
      return words.slice(0, -4).join(" ").trim() || null;
    }
  }

  const bodyMatch = collapseWhitespace(bodyText).match(/\bShop all ([A-Za-z0-9 '&.-]+)\b/i);
  return bodyMatch ? bodyMatch[1].trim() : null;
}

function isLikelySize(candidate, brand) {
  if (!candidate) {
    return false;
  }

  const normalizedCandidate = collapseWhitespace(candidate).toLowerCase();
  const normalizedBrand = collapseWhitespace(brand ?? "").toLowerCase();

  if (!normalizedCandidate) {
    return false;
  }
  if (normalizedBrand && normalizedCandidate === normalizedBrand) {
    return false;
  }
  if (/^(good\s*&\s*gather|up&up|folgers|bunny|barilla|cheerios|coca-cola zero)$/i.test(normalizedCandidate)) {
    return false;
  }

  return sizePatterns.some((pattern) => pattern.test(candidate));
}

function parseSize(...candidates) {
  for (const candidate of candidates) {
    const text = collapseWhitespace(candidate);
    if (!text) {
      continue;
    }

    for (const pattern of sizePatterns) {
      const match = text.match(pattern);
      if (match) {
        return collapseWhitespace(match[0]);
      }
    }
  }

  return null;
}

function parsePdpHtml(html, requestedUrl) {
  const $ = cheerio.load(html);
  const bodyText = collapseWhitespace($("body").text());
  const decodedHtml = decodeEmbeddedHtml(html);
  const canonicalUrl = $("link[rel='canonical']").attr("href")?.trim() ?? requestedUrl;
  const itemId = extractTargetItemId(canonicalUrl);
  const structuredContext = parseStructuredContext(decodedHtml, itemId);
  const name =
    collapseWhitespace($("h1").first().text()) ||
    collapseWhitespace($("title").first().text()).replace(/\s*:\s*Target\s*$/i, "");

  if (!name) {
    return null;
  }

  const structuredPrice = parseStructuredPrice(structuredContext);
  const price = structuredPrice.price ?? parseMoney($("meta[property='product:price:amount']").attr("content"));
  const regularPrice = structuredPrice.regularPrice ?? price;

  const structuredAvailability = structuredContext?.match(/"availability_status":"([^"]+)"/i)?.[1] ?? null;
  const availability = structuredAvailability
    ? parseAvailability(structuredAvailability)
    : parseAvailability(bodyText);
  const brand = parseBrand($, bodyText, structuredContext);
  const rawSize = parseSize(
    name,
    structuredContext?.match(/Net weight:<\/B>\s*([^"<]+)/i)?.[1] ?? "",
    structuredContext?.match(/"Package Quantity:<\/B>\s*([^"<]+)/i)?.[1] ?? "",
    bodyText,
  );
  const size = isLikelySize(rawSize, brand) ? rawSize : null;

  return {
    productId: itemId,
    name,
    brand,
    size,
    price,
    regularPrice,
    salePrice: null,
    availability,
    productUrl: canonicalUrl,
    observedAt: nowIso(),
    sourceId: "target-public",
    sourceUrl: requestedUrl,
  };
}

export class TargetPublicScraperAdapter extends BaseSourceAdapter {
  getRateLimitPolicy() {
    return {
      requestsPerSecond: 0.5,
      minDelayMs: 2000,
    };
  }

  async validateSourceAccess() {
    const probeUrl = this.source.baseUrl;
    const robots = await checkRobotsAllowed(probeUrl);
    return {
      ok: robots.allowed,
      sourceId: this.source.id,
      reason: robots.allowed ? "crawlable" : "blocked_by_robots",
      robots,
      message: robots.allowed
        ? "Public Target product pages appear crawlable."
        : robots.blockedRule === "robots_unavailable"
          ? "Target public scraping stopped because robots.txt could not be verified from this environment."
          : "Target public product pages are blocked by robots.txt.",
    };
  }

  async searchProducts({ productUrl, itemId }) {
    const resolvedUrl = buildProductUrl({ productUrl, itemId });
    if (!resolvedUrl) {
      throw new Error("Target public PDP scraping requires productUrl or itemId.");
    }

    const robots = await checkRobotsAllowed(resolvedUrl);
    if (!robots.allowed) {
      if (robots.blockedRule === "robots_unavailable") {
        throw new Error("Target public scraping stopped: unable to verify robots.txt from this environment.");
      }
      throw new Error(`Target public scraping stopped: robots.txt disallows ${new URL(resolvedUrl).pathname}.`);
    }

    const response = await fetchWithPolicy(resolvedUrl, {
      minDelayMs: this.getRateLimitPolicy().minDelayMs,
      cacheTtlMs: 1000 * 60 * 30,
      headers: {
        accept: "text/html,application/xhtml+xml",
      },
    });

    const product = parsePdpHtml(response.body, resolvedUrl);
    if (!product) {
      throw new Error("No usable Target product data was found on the public product page.");
    }
    if (product.price == null) {
      throw new Error("Target public product page did not expose a usable price.");
    }
    if (product.price === 35) {
      throw new Error("Target public product page price matched a known shipping-threshold false positive.");
    }

    return {
      source: this.source.id,
      productUrl: resolvedUrl,
      products: [product],
      sourceUrl: resolvedUrl,
      fetchedAt: response.fetchedAt,
    };
  }

  async getProductDetails({ productUrl, itemId }) {
    const response = await this.searchProducts({ productUrl, itemId });
    return {
      product: response.products[0] ?? null,
      sourceUrl: response.sourceUrl,
      fetchedAt: response.fetchedAt,
    };
  }

  normalizeProduct(rawProduct, context = {}) {
    return buildNormalizedProductShape({
      source: rawProduct.sourceId ?? this.source.id,
      retailer: context.retailer ?? this.source.retailerName,
      storeId: context.storeId ?? null,
      storeName: context.storeName ?? null,
      productId: rawProduct.productId ?? createId("target_public_product"),
      sku: rawProduct.productId ?? null,
      upc: null,
      name: rawProduct.name ?? "Unknown Product",
      brand: rawProduct.brand ?? "Unknown Brand",
      size: rawProduct.size ?? null,
      unit: null,
      category: "grocery",
      imageUrl: null,
      productUrl: rawProduct.productUrl ?? context.sourceUrl ?? null,
      price: rawProduct.price ?? null,
      regularPrice: rawProduct.regularPrice ?? rawProduct.price ?? null,
      salePrice: rawProduct.salePrice ?? null,
      unitPrice: null,
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
