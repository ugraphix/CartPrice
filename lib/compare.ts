import { pricingRules, products, stores } from "@/lib/data";
import { normalizeText, stringSimilarity, tokenize } from "@/lib/fuzzy";
import {
  Coordinates,
  DayKey,
  MatchResult,
  PricingRule,
  Product,
  ShoppingListItem,
  Store,
  StoreComparison,
} from "@/lib/types";

function getCurrentLocalParts(timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const weekday = parts.find((part) => part.type === "weekday")?.value.toLowerCase() as DayKey;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return {
    weekday,
    minutes: hour * 60 + minute,
  };
}

function parseTimeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function isStoreOpenNow(store: Store) {
  const now = getCurrentLocalParts(store.timezone);
  const windows = store.hours[now.weekday] ?? [];

  return windows.some((window) => {
    const start = parseTimeToMinutes(window.start);
    const end = parseTimeToMinutes(window.end);

    if (end > start) {
      return now.minutes >= start && now.minutes <= end;
    }

    return now.minutes >= start || now.minutes <= end;
  });
}

function haversineMiles(a: Coordinates, b: Coordinates) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const startLat = toRadians(a.lat);
  const endLat = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function activeRule<T extends PricingRule["ruleType"]>(ruleType: T) {
  const today = new Date().toISOString().slice(0, 10);
  return pricingRules.find((rule) => {
    const starts = rule.effectiveStart <= today;
    const ends = !rule.effectiveEnd || rule.effectiveEnd >= today;
    return rule.ruleType === ruleType && starts && ends;
  });
}

function matchScore(item: ShoppingListItem, product: Product) {
  const itemText = normalizeText(item.rawName);
  const productText = normalizeText(
    `${product.normalizedName} ${(product.searchAliases ?? []).join(" ")}`,
  );
  const itemTokens = tokenize(item.rawName);
  const productTokens = tokenize(productText);

  const overlap = itemTokens.filter((token) => productTokens.includes(token)).length;
  const tokenScore = itemTokens.length ? overlap / itemTokens.length : 0;

  let bonus = 0;
  const flavorKeywords = [
    "chocolate",
    "vanilla",
    "cookie dough",
    "cookies and cream",
    "cookies cream",
    "brownie",
    "caramel",
    "coffee",
    "mint",
    "strawberry",
    "peanut butter",
    "rocky road",
    "fudge",
    "gelato",
  ];

  if (itemText.includes("milk") && product.category === "dairy") bonus += 0.15;
  if (itemText.includes("egg") && product.category === "eggs") bonus += 0.15;
  if (itemText.includes("banana") && product.category === "produce") bonus += 0.15;
  if (itemText.includes("coke") && product.brand.toLowerCase().includes("coca")) bonus += 0.15;
  if (itemText.includes("ice cream") && product.category === "ice-cream") bonus += 0.15;
  if (itemText.includes("pizza") && product.category === "frozen") bonus += 0.15;
  if (itemText.includes("coffee") && product.category === "coffee") bonus += 0.15;
  if (itemText.includes("diaper") && product.category === "baby") bonus += 0.15;
  if (itemText.includes("zero") && product.variant?.toLowerCase().includes("zero")) bonus += 0.1;
  if (itemText.includes("12") && product.packageCount === 12) bonus += 0.1;
  if (itemText.includes("gallon") && product.sizeUnit === "gal") bonus += 0.1;
  for (const keyword of flavorKeywords) {
    if (itemText.includes(keyword) && productText.includes(keyword)) {
      bonus += 0.08;
    }
  }
  if (itemText === productText) bonus += 0.25;
  if (item.preferredBrand) {
    const preferredBrandScore = Math.max(
      stringSimilarity(item.preferredBrand, product.brand),
      ...((product.searchAliases ?? []).map((alias) => stringSimilarity(item.preferredBrand!, alias))),
    );

    if (preferredBrandScore > 0.9) {
      bonus += 0.3;
    } else if (preferredBrandScore > 0.7) {
      bonus += 0.18;
    }
  }
  if (item.preferredCategory && item.preferredCategory === product.category) bonus += 0.15;
  if (
    item.preferredProductName &&
    stringSimilarity(item.preferredProductName, product.name) > 0.78
  ) {
    bonus += 0.25;
  }

  const fuzzyScore = Math.max(
    stringSimilarity(item.rawName, product.name),
    stringSimilarity(item.rawName, product.normalizedName),
    ...((product.searchAliases ?? []).map((alias) => stringSimilarity(item.rawName, alias))),
  );
  return Math.min(1, tokenScore * 0.45 + fuzzyScore * 0.55 + bonus);
}

function matchItemsForStore(storeId: string, list: ShoppingListItem[]): MatchResult[] {
  const storeProducts = products.filter((product) => product.storeId === storeId);

  return list.map((item) => {
    const ranked = storeProducts
      .map((product) => ({
        product,
        score: matchScore(item, product),
      }))
      .sort((left, right) => right.score - left.score);

    const best = ranked[0];
    if (!best || best.score < 0.45) {
      return {
        item,
        confidence: best?.score ?? 0,
        estimated: true,
        reason: "No confident catalog match found.",
        lineTotal: 0,
      };
    }

    return {
      item,
      product: best.product,
      confidence: best.score,
      estimated: best.score < 0.8,
      reason: best.score < 0.8 ? "Estimated match based on text and size similarity." : "Strong catalog match.",
      lineTotal: best.product.price * item.quantity,
    };
  });
}

function calculateSalesTax(matches: MatchResult[]) {
  const salesTaxRule = activeRule("sales_tax");
  const rate =
    salesTaxRule && salesTaxRule.ruleType === "sales_tax" ? salesTaxRule.ruleJson.rate : 0;
  const taxableSubtotal = matches.reduce((sum, match) => {
    if (!match.product?.taxable) {
      return sum;
    }
    return sum + match.lineTotal;
  }, 0);

  return taxableSubtotal * rate;
}

function calculateBeverageTax(matches: MatchResult[]) {
  const beverageRule = activeRule("sweetened_beverage_tax");
  if (!beverageRule || beverageRule.ruleType !== "sweetened_beverage_tax") {
    return 0;
  }

  return matches.reduce((sum, match) => {
    const product = match.product;
    if (!product?.beverageTaxable) {
      return sum;
    }

    const ounces = product.sizeUnit === "oz" ? product.sizeValue * (product.packageCount ?? 1) : 0;
    return sum + ounces * beverageRule.ruleJson.ratePerOunce * match.item.quantity;
  }, 0);
}

function calculateBagFee(matches: MatchResult[]) {
  const bagRule = activeRule("bag_fee");
  if (!bagRule || bagRule.ruleType !== "bag_fee") {
    return 0;
  }

  const totalBagUnits = matches.reduce(
    (sum, match) => sum + (match.product?.bagUnits ?? 0) * match.item.quantity,
    0,
  );
  if (totalBagUnits <= 0) {
    return 0;
  }

  const estimatedBags = Math.max(1, Math.ceil(totalBagUnits / 3));

  return estimatedBags * bagRule.ruleJson.paper;
}

function sortByTotal(results: StoreComparison[]) {
  return [...results].sort((left, right) => left.total - right.total);
}

export function formatHours(store: Store) {
  const now = getCurrentLocalParts(store.timezone);
  const windows = store.hours[now.weekday];

  if (!windows?.length) {
    return "Closed today";
  }

  return windows.map((window) => `${window.start}-${window.end}`).join(", ");
}

export function compareStores(params: {
  userLocation: Coordinates;
  radiusMiles: number;
  shoppingList: ShoppingListItem[];
  openNowOnly: boolean;
}) {
  const nearbyResults = stores
    .map((store) => {
      const distanceMiles = haversineMiles(params.userLocation, store.coordinates);
      return { store, distanceMiles };
    })
    .filter(({ distanceMiles }) => distanceMiles <= params.radiusMiles)
    .map(({ store, distanceMiles }) => {
      const matches = store.supportsPricing ? matchItemsForStore(store.id, params.shoppingList) : [];
      const subtotal = matches.reduce((sum, match) => sum + match.lineTotal, 0);
      const salesTax = calculateSalesTax(matches);
      const beverageTax = calculateBeverageTax(matches);
      const bagFee = calculateBagFee(matches);
      const total = subtotal + salesTax + beverageTax + bagFee;
      const isOpenNow = isStoreOpenNow(store);

      return {
        store,
        distanceMiles,
        isOpenNow,
        supported: store.supportsPricing,
        matches,
        unmatched: matches.filter((match) => !match.product).map((match) => match.item),
        subtotal,
        salesTax,
        beverageTax,
        bagFee,
        total,
      } satisfies StoreComparison;
    });

  const filtered = params.openNowOnly ? nearbyResults.filter((result) => result.isOpenNow) : nearbyResults;
  const ranked = sortByTotal(filtered.filter((result) => result.supported));
  const unsupported = filtered.filter((result) => !result.supported);

  return {
    ranked,
    unsupported,
    cheapest: ranked[0],
    nextCheapest: ranked[1],
    coverage: {
      supported: ranked.length,
      unsupported: unsupported.length,
      searched: filtered.length,
    },
  };
}
