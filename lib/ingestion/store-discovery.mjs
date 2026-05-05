import { fetchWithPolicy } from "./http-client.mjs";
import { nowIso, normalizeText, uniqueBy } from "./utils.mjs";

async function geocodeZip(zipCode, countryCode) {
  const params = new URLSearchParams({
    postalcode: zipCode,
    country: countryCode.toUpperCase(),
    format: "jsonv2",
    limit: "1",
  });

  const response = await fetchWithPolicy(`https://nominatim.openstreetmap.org/search?${params}`, {
    minDelayMs: 1100,
    cacheTtlMs: 1000 * 60 * 60 * 24,
  });

  const place = response.body?.[0];
  if (!place) {
    return null;
  }

  return {
    latitude: Number(place.lat),
    longitude: Number(place.lon),
  };
}

async function fetchNearbySupermarkets({ latitude, longitude, radiusMeters = 8000 }) {
  const query = `
[out:json][timeout:25];
(
  node["shop"="supermarket"](around:${radiusMeters},${latitude},${longitude});
  way["shop"="supermarket"](around:${radiusMeters},${latitude},${longitude});
  relation["shop"="supermarket"](around:${radiusMeters},${latitude},${longitude});
);
out center tags;
  `.trim();

  const response = await fetchWithPolicy("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "content-type": "text/plain",
    },
    body: query,
    minDelayMs: 1500,
    cacheTtlMs: 1000 * 60 * 60 * 24,
  });

  return response.body?.elements ?? [];
}

function mapOverpassElement(element, zipCode) {
  const latitude = element.lat ?? element.center?.lat ?? null;
  const longitude = element.lon ?? element.center?.lon ?? null;
  const name = element.tags?.name ?? element.tags?.brand ?? "Unknown grocery store";

  return {
    id: `osm_${element.type}_${element.id}`,
    retailerSourceId: "openstreetmap",
    externalStoreCode: String(element.id),
    name,
    zipCode,
    city: element.tags?.["addr:city"] ?? null,
    stateCode: element.tags?.["addr:state"] ?? null,
    latitude,
    longitude,
    sourceUrl: "https://overpass-api.de/api/interpreter",
    observedAt: nowIso(),
    raw: element,
  };
}

export async function discoverStoresByZip({ zipCode, countryCode = "us" }) {
  const coordinates = await geocodeZip(zipCode, countryCode);
  if (!coordinates) {
    return [];
  }

  const elements = await fetchNearbySupermarkets(coordinates);
  const stores = elements
    .map((element) => mapOverpassElement(element, zipCode))
    .filter((store) => Boolean(store.latitude && store.longitude));

  return uniqueBy(stores, (store) => normalizeText(`${store.name}:${store.latitude}:${store.longitude}`));
}
