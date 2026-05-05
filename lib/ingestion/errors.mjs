import { createId, nowIso } from "./utils.mjs";

export const ErrorTypes = {
  blockedByRobots: "blocked_by_robots",
  blockedBySite: "blocked_by_site",
  rateLimited: "rate_limited",
  parserChanged: "parser_changed",
  missingPrice: "missing_price",
  missingStoreContext: "missing_store_context",
  invalidResponse: "invalid_response",
  apiLimitReached: "api_limit_reached",
};

export function createSourceError(type, sourceId, details = {}) {
  return {
    id: createId("source_error"),
    type,
    sourceId,
    timestamp: nowIso(),
    ...details,
  };
}
