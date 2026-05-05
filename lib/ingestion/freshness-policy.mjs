export const freshnessPolicy = {
  popular: {
    ttlHours: 6,
    label: "Popular basket items",
  },
  normal: {
    ttlHours: 24,
    label: "Normal grocery items",
  },
  "long-tail": {
    ttlHours: 72,
    label: "Long-tail products",
  },
  promoSensitive: {
    ttlHours: 24,
    label: "Promotion-sensitive products",
  },
  stores: {
    ttlHours: 24 * 30,
    label: "Store metadata",
  },
};

export function getTtlHoursForBasketItem(item) {
  return freshnessPolicy[item.popularity]?.ttlHours ?? freshnessPolicy.normal.ttlHours;
}

export function getExpiryIso(observedAt, ttlHours) {
  const expiresAt = new Date(observedAt);
  expiresAt.setHours(expiresAt.getHours() + ttlHours);
  return expiresAt.toISOString();
}
