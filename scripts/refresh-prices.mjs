import { refreshPrices } from "../lib/ingestion/ingestion-service.mjs";

const result = await refreshPrices();
console.log(JSON.stringify(result.run, null, 2));
