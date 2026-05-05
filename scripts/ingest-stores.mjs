import { ingestStores } from "../lib/ingestion/ingestion-service.mjs";
import { parseCliArgs } from "../lib/ingestion/utils.mjs";

const args = parseCliArgs(process.argv.slice(2));
const zipCode = args.zip ?? "98101";

const result = await ingestStores({ zipCode });
console.log(JSON.stringify(result.run, null, 2));
