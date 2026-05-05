import fs from "node:fs/promises";
import path from "node:path";
import { outputFiles } from "./config.mjs";
import { nowIso } from "./utils.mjs";

async function ensureDirectoryFor(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function readCollection(filePath) {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function writeJson(filePath, data) {
  await ensureDirectoryFor(filePath);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function appendCollection(filePath, records) {
  const current = await readCollection(filePath);
  current.push(...records);
  await writeJson(filePath, current);
  return current;
}

export async function upsertById(filePath, records) {
  const current = await readCollection(filePath);
  const map = new Map(current.map((record) => [record.id, record]));
  for (const record of records) {
    map.set(record.id, { ...map.get(record.id), ...record });
  }
  const next = [...map.values()];
  await writeJson(filePath, next);
  return next;
}

export async function writeRunArtifacts({
  run,
  products,
  prices,
  sourceErrors,
  matches,
}) {
  await Promise.all([
    writeJson(outputFiles.latestRun, run),
    writeJson(outputFiles.normalizedProducts, {
      generatedAt: nowIso(),
      count: products.length,
      products,
    }),
    writeJson(outputFiles.latestPrices, {
      generatedAt: nowIso(),
      count: prices.length,
      prices,
    }),
    writeJson(outputFiles.sourceErrors, {
      generatedAt: nowIso(),
      count: sourceErrors.length,
      errors: sourceErrors,
    }),
    writeJson(outputFiles.productMatches, {
      generatedAt: nowIso(),
      count: matches.length,
      matches,
    }),
  ]);
}
