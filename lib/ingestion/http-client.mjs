import fs from "node:fs/promises";
import path from "node:path";
import { defaultUserAgent, outputFiles } from "./config.mjs";
import { nowIso, sleep, stableHash } from "./utils.mjs";

const domainState = new Map();

export class HttpError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "HttpError";
    this.details = details;
  }
}

async function enforceRateLimit(hostname, minDelayMs) {
  const previous = domainState.get(hostname) ?? 0;
  const now = Date.now();
  const waitMs = previous + minDelayMs - now;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  domainState.set(hostname, Date.now());
}

async function readCache(cacheFile) {
  try {
    return JSON.parse(await fs.readFile(cacheFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeCache(cacheFile, payload) {
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(payload, null, 2));
}

export async function fetchWithPolicy(url, options = {}) {
  const {
    method = "GET",
    headers = {},
    minDelayMs = 500,
    retries = 2,
    retryStatuses = [429, 403, 503],
    cacheTtlMs = 0,
    cacheKey,
    body,
  } = options;

  const target = new URL(url);
  const effectiveCacheKey = cacheKey ?? stableHash({ url, method, body });
  const cacheFile = path.join(outputFiles.cacheDir, `${effectiveCacheKey}.json`);

  if (cacheTtlMs > 0) {
    const cached = await readCache(cacheFile);
    if (cached && Date.now() - new Date(cached.cachedAt).getTime() < cacheTtlMs) {
      return cached.response;
    }
  }

  await enforceRateLimit(target.hostname, minDelayMs);

  let attempt = 0;
  while (attempt <= retries) {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          "user-agent": defaultUserAgent,
          accept: "application/json, text/plain, */*",
          ...headers,
        },
        body,
      });
    } catch (error) {
      if (attempt >= retries) {
        throw new HttpError("Network request failed", {
          url,
          code: error.code,
          message: error.message,
        });
      }
      await sleep((attempt + 1) * 1000);
      attempt += 1;
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (response.ok) {
      const normalized = {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: payload,
        fetchedAt: nowIso(),
      };
      if (cacheTtlMs > 0) {
        await writeCache(cacheFile, {
          cachedAt: nowIso(),
          response: normalized,
        });
      }
      return normalized;
    }

    const shouldRetry = retryStatuses.includes(response.status) && attempt < retries;
    if (!shouldRetry) {
      throw new HttpError(`Request failed with ${response.status}`, {
        status: response.status,
        body: payload,
        url,
      });
    }

    await sleep((attempt + 1) * 1000);
    attempt += 1;
  }

  throw new HttpError("Request retries exhausted", { url });
}
