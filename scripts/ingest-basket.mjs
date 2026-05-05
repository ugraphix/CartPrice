import { ingestBasket } from "../lib/ingestion/ingestion-service.mjs";
import { parseCliArgs } from "../lib/ingestion/utils.mjs";

const args = parseCliArgs(process.argv.slice(2));
const zipCode = args.zip ?? "98101";
const sourceIds = args.sources ? args.sources.split(",") : ["qfc", "fred-meyer"];

const result = await ingestBasket({ zipCode, sourceIds });
console.log(JSON.stringify(result.run, null, 2));
