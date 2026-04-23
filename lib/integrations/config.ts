type EnvKey =
  | "GOOGLE_MAPS_API_KEY"
  | "KROGER_CLIENT_ID"
  | "KROGER_CLIENT_SECRET"
  | "MEALME_API_KEY"
  | "APIFY_TOKEN"
  | "FOODSPARK_API_KEY"
  | "WA_DOR_TAX_LOOKUP_URL";

function readEnv(key: EnvKey) {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value : undefined;
}

export const integrationConfig = {
  googleMapsApiKey: readEnv("GOOGLE_MAPS_API_KEY"),
  krogerClientId: readEnv("KROGER_CLIENT_ID"),
  krogerClientSecret: readEnv("KROGER_CLIENT_SECRET"),
  mealmeApiKey: readEnv("MEALME_API_KEY"),
  apifyToken: readEnv("APIFY_TOKEN"),
  foodsparkApiKey: readEnv("FOODSPARK_API_KEY"),
  waDorTaxLookupUrl:
    readEnv("WA_DOR_TAX_LOOKUP_URL") ?? "https://webgis.dor.wa.gov/webapi/AddressRates.aspx",
} as const;

export function assertConfig(keys: EnvKey[]) {
  const missing = keys.filter((key) => !readEnv(key));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export function hasConfig(key: EnvKey) {
  return Boolean(readEnv(key));
}
