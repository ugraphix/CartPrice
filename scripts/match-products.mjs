import { matchExistingProducts } from "../lib/ingestion/ingestion-service.mjs";

const matches = await matchExistingProducts();
console.log(JSON.stringify({ generated: matches.length }, null, 2));
