import { compareStores } from "@/lib/compare";
import { findNearbyStores } from "@/lib/integrations/google-places";
import { searchKrogerCatalog } from "@/lib/integrations/kroger";
import { lookupWashingtonTax } from "@/lib/integrations/tax";
import { ComparisonRequest, ComparisonResponse } from "@/lib/integrations/types";
import { stores as demoStores, products as demoProducts } from "@/lib/data";

export async function buildComparison(
  request: ComparisonRequest,
): Promise<ComparisonResponse> {
  const [storeDiscovery, taxBreakdown] = await Promise.all([
    findNearbyStores({
      location: request.location,
      radiusMiles: request.radiusMiles,
      openNowOnly: request.openNowOnly,
    }),
    lookupWashingtonTax({ coordinates: request.location }),
  ]);

  await Promise.all(
    request.shoppingList.map((item) =>
      searchKrogerCatalog({
        query: item.rawName,
        location: request.location,
        radiusMiles: request.radiusMiles,
        storeIds: storeDiscovery.stores.filter((store) => store.supportsPricing).map((store) => store.id),
      }),
    ),
  );

  const result = compareStores({
    userLocation: request.location,
    radiusMiles: request.radiusMiles,
    shoppingList: request.shoppingList,
    openNowOnly: request.openNowOnly,
  });

  return {
    ...result,
    sources: {
      stores: storeDiscovery.provider,
      pricing: demoProducts.length > 0 ? ["kroger"] : [],
      taxes: taxBreakdown.sourceLabel ? "wa-dor" : "wa-dor",
    },
  };
}

export function getCurrentComparisonArchitecture() {
  return {
    liveProvidersPlanned: ["google-places", "kroger", "wa-dor"],
    futureExpansionProviders: ["mealme"],
    fallbackDataSources: ["apify", "foodspark"],
    currentMode: {
      storesSeeded: demoStores.length,
      productsSeeded: demoProducts.length,
      pricingMode: "demo-catalog",
    },
  } as const;
}
