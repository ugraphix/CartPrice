import { createId, normalizeText } from "./utils.mjs";

function levenshtein(left, right) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let col = 0; col < cols; col += 1) matrix[0][col] = col;
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }
  return matrix[left.length][right.length];
}

function similarity(left, right) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  const distance = levenshtein(normalizedLeft, normalizedRight);
  return Math.max(0, 1 - distance / Math.max(normalizedLeft.length, normalizedRight.length));
}

export function matchProducts(products) {
  const grouped = new Map();
  for (const product of products) {
    const upcKey = product.upc ? `upc:${product.upc}` : null;
    const exactKey = `exact:${normalizeText(product.brand)}:${normalizeText(product.name)}:${normalizeText(product.size)}`;
    const key = upcKey ?? exactKey;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(product);
  }

  const matches = [];
  for (const [, group] of grouped) {
    const canonicalProductId = createId("canonical");
    for (const product of group) {
      let matchMethod = product.upc ? "upc" : "exact";
      let matchConfidence = product.upc ? 1 : 0.96;

      if (!product.upc) {
        const score = similarity(`${product.brand} ${product.name}`, `${group[0].brand} ${group[0].name}`);
        if (score < 0.95) {
          matchMethod = "fuzzy";
          matchConfidence = Number(score.toFixed(2));
        }
      }

      matches.push({
        id: createId("match"),
        productId: product.productId,
        canonicalProductId,
        retailer: product.retailer,
        storeId: product.storeId,
        matchMethod,
        matchConfidence,
        flaggedForReview: matchMethod === "fuzzy" && matchConfidence < 0.9,
      });
    }
  }

  return matches;
}
