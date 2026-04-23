import { Coordinates, Product, ShoppingListItem, Store, StoreComparison } from "@/lib/types";

export type SupportedProvider = "google-places" | "kroger" | "mealme" | "wa-dor";

export type NearbyStoreSearchParams = {
  location: Coordinates;
  radiusMiles: number;
  openNowOnly?: boolean;
};

export type ProductSearchParams = {
  query: string;
  location: Coordinates;
  radiusMiles: number;
  storeIds?: string[];
};

export type TaxLookupParams = {
  address?: string;
  coordinates?: Coordinates;
};

export type LiveProductCandidate = {
  provider: SupportedProvider;
  storeId: string;
  externalId: string;
  title: string;
  brand?: string;
  sizeText?: string;
  category?: string;
  price?: number;
  unitPrice?: number;
  inStock?: boolean;
  raw?: unknown;
};

export type StoreDiscoveryResult = {
  stores: Store[];
  provider: SupportedProvider;
  fetchedAt: string;
};

export type CatalogLookupResult = {
  products: Product[];
  provider: SupportedProvider;
  fetchedAt: string;
};

export type TaxBreakdown = {
  jurisdiction: string;
  salesTaxRate: number;
  sourceLabel: string;
};

export type ComparisonRequest = {
  shoppingList: ShoppingListItem[];
  location: Coordinates;
  radiusMiles: number;
  openNowOnly: boolean;
};

export type ComparisonResponse = {
  ranked: StoreComparison[];
  unsupported: StoreComparison[];
  cheapest?: StoreComparison;
  nextCheapest?: StoreComparison;
  coverage: {
    supported: number;
    unsupported: number;
    searched: number;
  };
  sources: {
    stores: SupportedProvider;
    pricing: SupportedProvider[];
    taxes: SupportedProvider;
  };
};
