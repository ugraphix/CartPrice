import { getSourceById } from "./source-registry.mjs";
import { KrogerAdapter } from "./kroger-adapter.mjs";

export async function createAdapter(sourceId) {
  const source = await getSourceById(sourceId);
  switch (sourceId) {
    case "kroger":
    case "qfc":
    case "fred-meyer":
      return new KrogerAdapter({ source });
    default:
      throw new Error(`No adapter implemented for source: ${sourceId}`);
  }
}
