import { ingestProducts } from "../lib/ingestion/ingestion-service.mjs";
import { parseCliArgs } from "../lib/ingestion/utils.mjs";

const args = parseCliArgs(process.argv.slice(2));
const sourceId = args.source ?? "kroger";
const zipCode = args.zip ?? "98101";
const query = args.query ?? "milk";
const storeId = args.storeId;

const result = await ingestProducts({ sourceId, zipCode, query, storeId });
console.log(JSON.stringify(result.run, null, 2));
