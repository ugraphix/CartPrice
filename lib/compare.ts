import { compareStoreCatalog, formatHours, getCurrentLocalParts, isStoreOpenNow } from "./comparison-domain.ts";
import { pricingRules, products, stores } from "./data.ts";
import type { ComparableCatalogProduct, Coordinates, ShoppingListItem } from "./types.ts";

function mapDemoProducts(): ComparableCatalogProduct[] {
  return products.map((product) => ({
    id: product.id,
    storeId: product.storeId,
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
    priceUpdatedAt: null,
    stalePrice: false,
  }));
}

export { formatHours, getCurrentLocalParts, isStoreOpenNow };

export function compareStores(params: {
  userLocation: Coordinates;
  radiusMiles: number;
  shoppingList: ShoppingListItem[];
  openNowOnly: boolean;
}) {
  return compareStoreCatalog({
    stores,
    products: mapDemoProducts(),
    pricingRules,
    userLocation: params.userLocation,
    radiusMiles: params.radiusMiles,
    shoppingList: params.shoppingList,
    openNowOnly: params.openNowOnly,
  });
}
