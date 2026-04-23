# CartPrice API Integration Plan

This repo currently runs on seeded grocery data for UX and pricing-rule development. The next step is to replace demo inputs with live providers in a controlled order.

## Primary launch path

1. Google Places API
   - store discovery
   - store hours
   - open-now filtering
2. Kroger Developers API
   - official product catalog
   - supported store pricing coverage
   - initial production pricing partner
3. Washington DOR tax lookup
   - address-based tax resolution
   - Seattle/WA tax support for totals

## Expansion path

- MealMe
  - strongest multi-store expansion option
  - useful once CartPrice needs broader chain coverage
- Apify / FoodSpark
  - fallback or supplemental scraped pricing
  - should remain clearly labeled and confidence-scored

## Current scaffolding

- `lib/integrations/google-places.ts`
- `lib/integrations/kroger.ts`
- `lib/integrations/tax.ts`
- `lib/services/comparison-service.ts`
- `lib/integrations/config.ts`
- `lib/integrations/types.ts`

## Implementation notes

- Keep store discovery broader than pricing support.
- Show unsupported stores as nearby but pricing unavailable.
- Preserve rule-driven fee logic for:
  - Washington sales tax
  - Seattle sweetened beverage tax
  - Seattle bag fees
- Keep matching confidence visible when product matches are estimated.

## Suggested next coding tasks

1. Add a server route that calls `buildComparison`.
2. Replace seeded store discovery with live Google Places lookups.
3. Implement Kroger OAuth token handling and product search.
4. Map WA DOR lookup responses into a normalized `TaxBreakdown`.
5. Add caching for stores, catalog responses, and tax lookups.
