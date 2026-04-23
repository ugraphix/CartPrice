PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS retailer_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  region TEXT NOT NULL,
  tier TEXT NOT NULL,
  access_mode TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS source_stores (
  id TEXT PRIMARY KEY,
  retailer_source_id TEXT NOT NULL REFERENCES retailer_sources(id) ON DELETE CASCADE,
  external_store_code TEXT,
  name TEXT NOT NULL,
  zip_code TEXT,
  city TEXT,
  state_code TEXT,
  latitude REAL,
  longitude REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS catalog_products (
  id TEXT PRIMARY KEY,
  retailer_source_id TEXT NOT NULL REFERENCES retailer_sources(id) ON DELETE CASCADE,
  source_store_id TEXT REFERENCES source_stores(id) ON DELETE SET NULL,
  external_product_id TEXT,
  canonical_brand TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  category TEXT NOT NULL,
  variant TEXT,
  size_text TEXT,
  size_value REAL,
  size_unit TEXT,
  package_count INTEGER,
  image_url TEXT,
  product_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_products_source_external
  ON catalog_products (retailer_source_id, external_product_id);

CREATE INDEX IF NOT EXISTS idx_catalog_products_normalized_name
  ON catalog_products (normalized_name);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id TEXT PRIMARY KEY,
  retailer_source_id TEXT NOT NULL REFERENCES retailer_sources(id) ON DELETE CASCADE,
  source_store_id TEXT REFERENCES source_stores(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  parser_version TEXT,
  item_count INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_observations (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  retailer_source_id TEXT NOT NULL REFERENCES retailer_sources(id) ON DELETE CASCADE,
  source_store_id TEXT REFERENCES source_stores(id) ON DELETE SET NULL,
  scrape_run_id TEXT REFERENCES scrape_runs(id) ON DELETE SET NULL,
  observed_at TEXT NOT NULL,
  zip_code TEXT,
  list_price REAL,
  sale_price REAL,
  unit_price REAL,
  unit_text TEXT,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  pricing_label TEXT,
  is_promotional INTEGER NOT NULL DEFAULT 0,
  raw_payload_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_price_observations_product_observed
  ON price_observations (product_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_observations_source_store_observed
  ON price_observations (retailer_source_id, source_store_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS stock_observations (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  retailer_source_id TEXT NOT NULL REFERENCES retailer_sources(id) ON DELETE CASCADE,
  source_store_id TEXT REFERENCES source_stores(id) ON DELETE SET NULL,
  scrape_run_id TEXT REFERENCES scrape_runs(id) ON DELETE SET NULL,
  observed_at TEXT NOT NULL,
  zip_code TEXT,
  in_stock INTEGER,
  stock_text TEXT,
  quantity_limit INTEGER,
  raw_payload_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_observations_product_observed
  ON stock_observations (product_id, observed_at DESC);

CREATE VIEW IF NOT EXISTS current_store_products AS
SELECT
  p.id AS product_id,
  p.retailer_source_id,
  p.source_store_id,
  p.canonical_brand,
  p.canonical_name,
  p.normalized_name,
  p.category,
  p.variant,
  p.size_text,
  p.size_value,
  p.size_unit,
  p.package_count,
  p.image_url,
  p.product_url,
  po.observed_at AS latest_price_observed_at,
  po.list_price,
  po.sale_price,
  po.unit_price,
  po.unit_text,
  po.pricing_label,
  so.observed_at AS latest_stock_observed_at,
  so.in_stock,
  so.stock_text
FROM catalog_products p
LEFT JOIN price_observations po
  ON po.id = (
    SELECT id
    FROM price_observations p2
    WHERE p2.product_id = p.id
    ORDER BY p2.observed_at DESC
    LIMIT 1
  )
LEFT JOIN stock_observations so
  ON so.id = (
    SELECT id
    FROM stock_observations s2
    WHERE s2.product_id = p.id
    ORDER BY s2.observed_at DESC
    LIMIT 1
  );
