import { validateSources } from "../lib/ingestion/ingestion-service.mjs";
import { parseCliArgs } from "../lib/ingestion/utils.mjs";

const args = parseCliArgs(process.argv.slice(2));
const report = await validateSources({ enabledOnly: args.all !== "true" });
console.log(JSON.stringify(report, null, 2));
