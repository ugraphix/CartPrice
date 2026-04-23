import { pricingRules } from "@/lib/data";
import { integrationConfig } from "@/lib/integrations/config";
import { TaxBreakdown, TaxLookupParams } from "@/lib/integrations/types";

export async function lookupWashingtonTax(
  _params: TaxLookupParams,
): Promise<TaxBreakdown> {
  const demoRule = pricingRules.find((rule) => rule.ruleType === "sales_tax");
  const rate = demoRule?.ruleType === "sales_tax" ? demoRule.ruleJson.rate : 0;

  if (!integrationConfig.waDorTaxLookupUrl) {
    return {
      jurisdiction: "seattle-wa",
      salesTaxRate: rate,
      sourceLabel: "WA DOR fallback configuration missing",
    };
  }

  // Live WA DOR address lookup belongs here next.
  return {
    jurisdiction: "seattle-wa",
    salesTaxRate: rate,
    sourceLabel: "WA DOR URL interface",
  };
}
