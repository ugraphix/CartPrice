export type CatalogSourceTier = "official_api" | "official_site" | "marketplace" | "scrape_fallback";

export type CatalogAccessMode =
  | "public_browse"
  | "zip_required"
  | "store_required"
  | "login_required"
  | "partner_required";

export type CatalogRetailerSource = {
  id: string;
  name: string;
  url: string;
  region: "national" | "regional" | "online-first" | "specialty";
  tier: CatalogSourceTier;
  accessMode: CatalogAccessMode;
  notes?: string;
};

export type CatalogProductRecord = {
  id: string;
  retailerSourceId: string;
  externalProductId?: string;
  canonicalBrand: string;
  canonicalName: string;
  normalizedName: string;
  category: string;
  variant?: string;
  sizeText?: string;
  sizeValue?: number;
  sizeUnit?: string;
  packageCount?: number;
  imageUrl?: string;
  productUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type CatalogPriceObservation = {
  id: string;
  productId: string;
  retailerSourceId: string;
  observedAt: string;
  zipCode?: string;
  storeCode?: string;
  storeName?: string;
  listPrice?: number;
  salePrice?: number;
  unitPrice?: number;
  unitText?: string;
  inStock?: boolean;
  pricingLabel?: string;
  rawCurrency?: string;
};

export type CatalogScrapeRun = {
  id: string;
  retailerSourceId: string;
  startedAt: string;
  completedAt?: string;
  status: "planned" | "running" | "completed" | "failed";
  itemCount?: number;
  notes?: string;
};
