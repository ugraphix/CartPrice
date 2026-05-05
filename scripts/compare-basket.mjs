import { compareBasketByZip, writeBasketComparison } from "../lib/ingestion/basket-compare.mjs";
import { parseCliArgs } from "../lib/ingestion/utils.mjs";

const args = parseCliArgs(process.argv.slice(2));
const zipCode = args.zip ?? "98101";
const providerMode = args.mode ?? "auto";

const result = await compareBasketByZip({ zipCode, providerMode });
const outputPath = await writeBasketComparison(result);

console.log(JSON.stringify({ outputPath, ...result }, null, 2));
