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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function parseSizeFromName(name) {
  const match = collapseWhitespace(name).match(/-\s*([^()-]+)$/);
  return match ? match[1].trim() : null;
}

function parseSizeFromBody(text) {
  const labelMatch = collapseWhitespace(text).match(/\bSize\s+([^\s][^*]{1,30})/i);
  if (labelMatch) {
    return collapseWhitespace(labelMatch[1]).split(" Add to cart")[0].trim();
  }
  const weightMatch = collapseWhitespace(text).match(/\bNet weight:\s*([^*]{1,40})/i);
  return weightMatch ? collapseWhitespace(weightMatch[1]) : null;
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

function parseBrand($, bodyText) {
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

function parsePdpHtml(html, requestedUrl) {
  const $ = cheerio.load(html);
  const bodyText = collapseWhitespace($("body").text());
  const canonicalUrl = $("link[rel='canonical']").attr("href")?.trim() ?? requestedUrl;
  const itemId = extractTargetItemId(canonicalUrl);
  const name =
    collapseWhitespace($("h1").first().text()) ||
    collapseWhitespace($("title").first().text()).replace(/\s*:\s*Target\s*$/i, "");

  if (!name) {
    return null;
  }

  const priceContextPattern = new RegExp(
    `current_retail\\\\":(\\d+(?:\\.\\d+)?)` +
      `[\\s\\S]{0,500}?external_system_id\\\\":\\\\"${escapeRegExp(itemId)}-[^"]+\\\\"`,
    "i",
  );
  const regContextPattern = new RegExp(
    `reg_retail\\\\":(\\d+(?:\\.\\d+)?)` +
      `[\\s\\S]{0,500}?external_system_id\\\\":\\\\"${escapeRegExp(itemId)}-[^"]+\\\\"`,
    "i",
  );

  const embeddedPrice = priceContextPattern.exec(html)?.[1];
  const embeddedRegularPrice = regContextPattern.exec(html)?.[1];
  const price =
    (embeddedPrice ? Number(embeddedPrice) : null) ??
    parseMoney($("meta[property='product:price:amount']").attr("content")) ??
    parseMoney(bodyText);
  const regularPrice = embeddedRegularPrice ? Number(embeddedRegularPrice) : price;

  const availability = parseAvailability(bodyText);
  const brand = parseBrand($, bodyText);
  const size = parseSizeFromName(name) ?? parseSizeFromBody(bodyText);

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
