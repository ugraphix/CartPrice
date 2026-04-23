import { products as demoProducts } from "@/lib/data";
import { Product } from "@/lib/types";
import { integrationConfig } from "@/lib/integrations/config";
import { CatalogLookupResult, ProductSearchParams } from "@/lib/integrations/types";

function filterDemoCatalog(params: ProductSearchParams): Product[] {
  const query = params.query.toLowerCase().trim();
  return demoProducts.filter((product) => {
    const matchesStore = !params.storeIds?.length || params.storeIds.includes(product.storeId);
    const matchesQuery =
      product.name.toLowerCase().includes(query) || product.normalizedName.toLowerCase().includes(query);

    return matchesStore && matchesQuery;
  });
}

export async function searchKrogerCatalog(
  params: ProductSearchParams,
): Promise<CatalogLookupResult> {
  if (!integrationConfig.krogerClientId || !integrationConfig.krogerClientSecret) {
    return {
      products: filterDemoCatalog(params),
      provider: "kroger",
      fetchedAt: new Date().toISOString(),
    };
  }

  // Live Kroger auth + product lookup belongs here next.
  return {
    products: filterDemoCatalog(params),
    provider: "kroger",
    fetchedAt: new Date().toISOString(),
  };
}
