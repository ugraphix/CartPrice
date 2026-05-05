# Public Scrape Viability

This note tracks small public-page proof checks before CartPrice commits to building a scraper adapter.

## Kroger public pages

- Source id: `kroger-public`
- Candidate URLs:
  - `https://www.kroger.com/q/milk`
  - `https://www.kroger.com/robots.txt`
- Result: not viable for now
- Reason:
  - simple unauthenticated HTTP requests to both the public shopping page and `robots.txt` timed out
  - CartPrice stops before scraping when robots cannot be verified
  - no product, price, availability, or store-context artifacts were produced

## Target public product pages

- Candidate URL:
  - `https://www.target.com/p/-/A-47896134`
- Robots status:
  - [robots.txt](https://www.target.com/robots.txt) does not disallow the `/p/` product path
  - search-style paths like `/s?` and `/shop/` are disallowed, so any first proof should stay on product pages unless a crawlable listing path is identified
- Simple HTTP proof:
  - plain unauthenticated requests returned the PDP HTML successfully
  - the response exposed a canonical product URL, visible product name, visible price, and `In Stock` text
- Current assessment:
  - viable next public scrape proof target
  - worth testing with a small PDP-only parser before building a broader search adapter
