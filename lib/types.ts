export type Coordinates = {
  lat: number;
  lng: number;
};

export type PricingScope = "store_level" | "online_generic" | "unknown";

export type DayKey =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export type OpeningWindow = {
  start: string;
  end: string;
};

export type Store = {
  id: string;
  chain: string;
  name: string;
  address: string;
  coordinates: Coordinates;
  timezone: string;
  supportsPricing: boolean;
  placeId: string;
  hours: Record<DayKey, OpeningWindow[]>;
};

export type Product = {
  id: string;
  storeId: string;
  sku: string;
  brand: string;
  name: string;
  normalizedName: string;
  searchAliases?: string[];
  category: string;
  variant?: string;
  sizeValue: number;
  sizeUnit: "oz" | "ct" | "lb" | "gal";
  packageCount?: number;
  price: number;
  taxable: boolean;
  beverageTaxable?: boolean;
  bagUnits?: number;
};

export type ComparableCatalogProduct = {
  id: string;
  storeId: string | null;
  pricingScope?: PricingScope;
  sku?: string | null;
  upc?: string | null;
  brand: string;
  name: string;
  normalizedName: string;
  searchAliases?: string[];
  category: string;
  variant?: string;
  sizeText?: string;
  sizeValue?: number;
  sizeUnit?: string;
  packageCount?: number;
  price: number | null;
  regularPrice?: number | null;
  salePrice?: number | null;
  unitPrice?: number | null;
  currency?: string;
  taxable?: boolean;
  beverageTaxable?: boolean;
  bagUnits?: number;
  availability?: string;
  fulfillmentModes?: string[];
  source?: string;
  sourceUrl?: string | null;
  priceUpdatedAt?: string | null;
  stalePrice?: boolean;
  raw?: unknown;
};

export type ShoppingListItem = {
  id: string;
  rawName: string;
  quantity: number;
  preferredBrand?: string;
  preferredProductName?: string;
  preferredCategory?: string;
  preferredSizeText?: string;
};

export type PricingRule =
  | {
      id: string;
      jurisdiction: string;
      ruleType: "sales_tax";
      effectiveStart: string;
      effectiveEnd?: string;
      ruleJson: {
        rate: number;
      };
    }
  | {
      id: string;
      jurisdiction: string;
      ruleType: "sweetened_beverage_tax";
      effectiveStart: string;
      effectiveEnd?: string;
      ruleJson: {
        ratePerOunce: number;
      };
    }
  | {
      id: string;
      jurisdiction: string;
      ruleType: "bag_fee";
      effectiveStart: string;
      effectiveEnd?: string;
      ruleJson: {
        paper: number;
        reusablePlastic: number;
      };
    };

export type MatchResult = {
  item: ShoppingListItem;
  product?: ComparableCatalogProduct;
  confidence: number;
  estimated: boolean;
  reason: string;
  lineTotal: number;
  matchMethod?: "upc" | "exact" | "fuzzy" | "manual";
  stalePrice?: boolean;
  sourceUrl?: string | null;
  priceUpdatedAt?: string | null;
  priceScope?: PricingScope;
};

export type StoreComparison = {
  store: Store;
  distanceMiles: number;
  isOpenNow: boolean;
  supported: boolean;
  matches: MatchResult[];
  unmatched: ShoppingListItem[];
  subtotal: number;
  salesTax: number;
  beverageTax: number;
  bagFee: number;
  total: number;
};

export type ComparisonProviderMode = "demo" | "live" | "auto";

export type ComparisonDataHealth = {
  mode: "demo" | "live";
  productCount: number;
  priceCount: number;
  storeCount: number;
  latestObservedAt?: string | null;
  latestPriceUpdatedAt?: string | null;
  usable: boolean;
  warning?: string;
};

export type ReferencePriceResult = {
  item: ShoppingListItem;
  product: ComparableCatalogProduct;
  confidence: number;
  priceScope: PricingScope;
  sourceUrl?: string | null;
  priceUpdatedAt?: string | null;
};
