# CartPrice Data Source Strategy

## 1. Current state

CartPrice has a clean split between:

- a demo comparison path for UI and product-flow validation
- a live ingestion path for provider-backed pricing evidence

The demo path works today. The live path also works structurally, but no source in the repo has yet been proven to provide `store_level` grocery pricing that is safe to use for cheapest-store ranking.

## 2. What works

- The seeded demo catalog supports the app UI and comparison flow.
- The ingestion system can validate sources, normalize product records, persist artifacts, and fail safely.
- `target-public` can extract public Target PDP product metadata and price from simple unauthenticated `/p/` pages.
- CartPrice now distinguishes pricing by scope:
  - `store_level`
  - `online_generic`
  - `unknown`
- Cheapest-store ranking is already limited to `store_level` pricing only.

## 3. What does not work yet

- No provider has proven `store_level` pricing in this repo.
- Kroger-family API ingestion is still blocked until valid credentials are available and tested.
- `kroger-public` is not viable right now because simple public requests timed out and robots verification could not be completed reliably.
- Walmart public search is blocked by `robots.txt`.
- Target public PDP availability is still unreliable, and no store-specific price or location context has been proven from that path.

## 4. Why `target-public` is reference-only

`target-public` currently works only as `online_generic` pricing because:

- it uses public PDP pages, not store-specific shopping flows
- ZIP input is not affecting the PDP request path
- tested prices stayed the same across ZIP contexts
- no trustworthy store ID, store name, or local fulfillment context was exposed
- availability remains `unknown`

That makes it useful as a product-level online price reference, but not as evidence for local store comparison.

## 5. Why `store_level` pricing is still required for cheapest-store comparison

CartPrice’s original value proposition is local grocery cart comparison. That requires evidence that a price is tied to a specific store or store-context, not just a public product page.

Without `store_level` pricing, CartPrice cannot honestly claim:

- which local store is cheapest
- whether one cart total beats another in a given ZIP or neighborhood
- whether a product is actually available from a specific store

Generic online PDP pricing is still useful, but it should be treated as reference pricing, not ranking input.

## 6. Next options

### Option A: Find a true store-level provider or API

This is the strongest path if CartPrice wants to stay focused on local store comparison. The next provider must prove:

- store-specific price
- store or fulfillment context
- enough product coverage to support basket estimates
- compliant access that does not depend on login bypass or scraping blocked pages

### Option B: Test another public source

This is a reasonable research path, but only if the source:

- allows crawling of the public pages in `robots.txt`
- shows visible public prices without login
- has some believable store or location context

This path may still only produce more `online_generic` pricing, so it should be treated as discovery work rather than assumed progress toward store comparison.

### Option C: Reposition the MVP around generic online reference pricing

If a true store-level source takes longer to secure, CartPrice can still become a useful grocery price reference tool first. In that version:

- demo/store-level ranking stays clearly labeled as non-live or unavailable
- live prices are shown as `online_generic` references
- the product message shifts from “which local store is cheapest” to “rough online price guidance for common grocery items”

This is a narrower promise, but it is honest and supported by current evidence.

## 7. Recommendation

Short term, CartPrice should treat itself as a grocery price reference tool unless and until a provider with proven `store_level` pricing is validated.

Strategically, the best next move is to search for one compliant source or API that can prove:

- store-level price
- store-level availability or fulfillment context
- enough basket coverage to support real comparison

Until that exists, the app should not present `online_generic` prices as if they are local store comparison prices.
