import { loadSourceRegistry } from "./config.mjs";

export async function getSourceRegistry() {
  return loadSourceRegistry();
}

export async function getSourceById(sourceId) {
  const sources = await getSourceRegistry();
  const source = sources.find((entry) => entry.id === sourceId);
  if (!source) {
    throw new Error(`Unknown source: ${sourceId}`);
  }
  return source;
}

export async function listEnabledSources() {
  const sources = await getSourceRegistry();
  return sources.filter((source) => source.enabled);
}
