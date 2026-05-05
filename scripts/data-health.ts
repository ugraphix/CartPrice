import { getLiveComparisonDataHealth } from "../lib/services/comparison-service.ts";

const health = await getLiveComparisonDataHealth();
console.log(JSON.stringify(health, null, 2));
