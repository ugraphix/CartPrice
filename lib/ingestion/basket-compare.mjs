import {
  buildCoreBasketComparison,
  writeLatestBasketComparison,
} from "../services/comparison-service.ts";

export async function compareBasketByZip({ zipCode, providerMode = "auto" }) {
  return buildCoreBasketComparison({ zipCode, providerMode });
}

export async function writeBasketComparison(result) {
  return writeLatestBasketComparison(result);
}
