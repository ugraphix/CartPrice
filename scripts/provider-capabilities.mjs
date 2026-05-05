import { buildProviderCapabilitiesReport, printProviderCapabilitiesSummary } from "../lib/ingestion/provider-capabilities.mjs";

const report = await buildProviderCapabilitiesReport();
printProviderCapabilitiesSummary(report);
console.log("");
console.log(JSON.stringify({
  generatedAt: report.generatedAt,
  count: report.count,
  output: "data/provider-capabilities/latest.json",
}, null, 2));

