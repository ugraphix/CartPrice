# Catalog Database Plan

CartPrice can store outside retailer catalog data, but it should not pretend every source offers the same kind of access.

## Normalized entities

- `CatalogRetailerSource`
  - one record per retailer or marketplace
  - tracks URL, source tier, and access requirements
- `CatalogProductRecord`
  - normalized product identity for a single retailer source
  - stores brand, product name, category, size, package count, image URL, and product URL
- `CatalogPriceObservation`
  - append-only price snapshots
  - supports ZIP-based, store-based, and time-based price differences
- `CatalogScrapeRun`
  - keeps ingestion history, status, counts, and operator notes

## Why one giant scrape is the wrong first move

The listed retailers do not expose pricing in one uniform public way.

- Some official sites vary price by selected store.
- Some vary by ZIP code or delivery region.
- Some require sign-in before product pricing is visible.
- Some marketplace prices differ from in-store prices.
- Some chains are better served through official APIs than brittle page scraping.

## Best rollout order

1. `Kroger-family official API sources`
   - Kroger
   - Fred Meyer
   - QFC
   - King Soopers
   - Fry's Food
   - Harris Teeter
2. `Public product-discovery sources with usable browse pages`
   - Trader Joe's
   - Vitacost
   - iHerb
   - Azure Standard
3. `Location-gated official storefronts`
   - Walmart
   - Target
   - Safeway / Albertsons family
   - Wegmans
   - H-E-B
4. `Marketplace and login-heavy sources`
   - Instacart
   - Amazon Fresh
   - Whole Foods on Amazon
   - Shipt

## Data quality rules

- Keep price observations separate from product identity.
- Always store the retailer source and observation timestamp.
- Record ZIP code or store code whenever price context depends on location.
- Flag marketplace data separately from first-party official API data.
- Never overwrite old prices; append new observations.
