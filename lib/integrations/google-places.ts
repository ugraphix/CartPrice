import { stores as demoStores } from "@/lib/data";
import { isStoreOpenNow } from "@/lib/compare";
import { Store } from "@/lib/types";
import { integrationConfig } from "@/lib/integrations/config";
import { NearbyStoreSearchParams, StoreDiscoveryResult } from "@/lib/integrations/types";

function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const startLat = toRadians(a.lat);
  const endLat = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function filterDemoStores(params: NearbyStoreSearchParams): Store[] {
  const inRadius = demoStores.filter((store) => {
    const distance = haversineMiles(params.location, store.coordinates);
    return distance <= params.radiusMiles;
  });

  return params.openNowOnly ? inRadius.filter((store) => isStoreOpenNow(store)) : inRadius;
}

export async function findNearbyStores(
  params: NearbyStoreSearchParams,
): Promise<StoreDiscoveryResult> {
  if (!integrationConfig.googleMapsApiKey) {
    return {
      stores: filterDemoStores(params),
      provider: "google-places",
      fetchedAt: new Date().toISOString(),
    };
  }

  // Live Google Places integration belongs here next.
  return {
    stores: filterDemoStores(params),
    provider: "google-places",
    fetchedAt: new Date().toISOString(),
  };
}
