export type Coordinates = {
  lat: number;
  lng: number;
};

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
  product?: Product;
  confidence: number;
  estimated: boolean;
  reason: string;
  lineTotal: number;
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
