export const freshnessPolicy = {
  priceUpdateWindow: "every 12 to 24 hours for active products",
  stockUpdateWindow: "every 2 to 6 hours for active products",
  highPriorityWindow: "every few hours for popular or watched items",
  disclaimer:
    "Prices and stock can change between refreshes, and some retailers vary pricing by ZIP code, store, delivery mode, or account state.",
} as const;

export function formatFreshnessWarning() {
  return [
    `Pricing updates: ${freshnessPolicy.priceUpdateWindow}.`,
    `Stock updates: ${freshnessPolicy.stockUpdateWindow}.`,
    freshnessPolicy.disclaimer,
  ].join(" ");
}
