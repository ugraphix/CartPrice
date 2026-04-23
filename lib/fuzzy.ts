import { products } from "@/lib/data";
import { Product, ShoppingListItem } from "@/lib/types";

const stopWords = new Set(["the", "a", "an", "pack", "count", "ct", "oz"]);

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token && !stopWords.has(token));
}

function levenshtein(left: string, right: string) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

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

export function stringSimilarity(left: string, right: string) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const distance = levenshtein(normalizedLeft, normalizedRight);
  const longest = Math.max(normalizedLeft.length, normalizedRight.length);
  return Math.max(0, 1 - distance / longest);
}

export type ProductSuggestion = {
  id: string;
  label: string;
  brand: string;
  productName: string;
  category: string;
  sizeText: string;
  normalizedSearchText: string;
};

export type BrandSuggestion = {
  id: string;
  brand: string;
  normalizedSearchText: string;
};

function formatSize(product: Product) {
  const count = product.packageCount ? ` x${product.packageCount}` : "";
  return `${product.sizeValue}${product.sizeUnit}${count}`;
}

const seenSuggestions = new Set<string>();

export const productSuggestions: ProductSuggestion[] = products
  .map((product) => {
    const key = `${product.brand}::${product.name}`;
    if (seenSuggestions.has(key)) {
      return null;
    }

    seenSuggestions.add(key);
    const sizeText = formatSize(product);

    return {
      id: key,
      label: `${product.brand} ${product.name}`,
      brand: product.brand,
      productName: product.name,
      category: product.category,
      sizeText,
      normalizedSearchText: normalizeText(
        `${product.brand} ${product.name} ${sizeText} ${(product.searchAliases ?? []).join(" ")}`,
      ),
    } satisfies ProductSuggestion;
  })
  .filter((suggestion): suggestion is ProductSuggestion => Boolean(suggestion));

const seenBrands = new Set<string>();

export const brandSuggestions: BrandSuggestion[] = productSuggestions
  .map((suggestion) => {
    const key = normalizeText(suggestion.brand);
    if (!key || seenBrands.has(key)) {
      return null;
    }

    seenBrands.add(key);
    return {
      id: key,
      brand: suggestion.brand,
      normalizedSearchText: normalizeText(suggestion.brand),
    } satisfies BrandSuggestion;
  })
  .filter((suggestion): suggestion is BrandSuggestion => Boolean(suggestion));

export function scoreSuggestion(query: string, suggestion: ProductSuggestion) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const queryTokens = tokenize(query);
  const labelTokens = tokenize(suggestion.label);
  const overlap = queryTokens.filter((token) => labelTokens.includes(token)).length;
  const tokenScore = queryTokens.length ? overlap / queryTokens.length : 0;
  const phraseScore = stringSimilarity(normalizedQuery, suggestion.normalizedSearchText);
  const brandScore = stringSimilarity(normalizedQuery, suggestion.brand);
  const productScore = stringSimilarity(normalizedQuery, suggestion.productName);
  const startsWithScore = suggestion.normalizedSearchText.startsWith(normalizedQuery) ? 1 : 0;
  const containsScore = suggestion.normalizedSearchText.includes(normalizedQuery) ? 1 : 0;

  if (tokenScore === 0 && containsScore === 0 && phraseScore < 0.55 && productScore < 0.6) {
    return 0;
  }

  return Math.max(
    phraseScore * 0.4 + tokenScore * 0.35 + containsScore * 0.25,
    productScore * 0.5 + tokenScore * 0.3 + startsWithScore * 0.2,
    brandScore * 0.2 + productScore * 0.5 + tokenScore * 0.3,
  );
}

export function getSuggestions(query: string, limit = 6) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return productSuggestions.slice(0, limit).map((suggestion) => ({
      suggestion,
      score: 0.5,
    }));
  }

  return productSuggestions
    .map((suggestion) => ({
      suggestion,
      score: scoreSuggestion(query, suggestion),
    }))
    .filter(({ score }) => score >= 0.45)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function getBrandSuggestions(query: string, limit = 6) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return brandSuggestions.slice(0, limit).map((suggestion) => ({
      suggestion,
      score: 0.5,
    }));
  }

  return brandSuggestions
    .map((suggestion) => {
      const startsWithScore = suggestion.normalizedSearchText.startsWith(normalizedQuery) ? 1 : 0;
      const containsScore = suggestion.normalizedSearchText.includes(normalizedQuery) ? 1 : 0;
      const similarityScore = stringSimilarity(normalizedQuery, suggestion.brand);
      return {
        suggestion,
        score: Math.max(
          startsWithScore * 0.55 + containsScore * 0.2 + similarityScore * 0.25,
          containsScore * 0.45 + similarityScore * 0.55,
        ),
      };
    })
    .filter(({ score }) => score >= 0.4)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function clearItemProductPreferences(item: ShoppingListItem): ShoppingListItem {
  return {
    ...item,
    preferredProductName: undefined,
    preferredCategory: undefined,
    preferredSizeText: undefined,
  };
}

export function applySuggestionToItem(
  current: ShoppingListItem,
  suggestion: ProductSuggestion,
): ShoppingListItem {
  return {
    ...current,
    rawName: suggestion.productName,
    preferredBrand: suggestion.brand,
    preferredProductName: suggestion.productName,
    preferredCategory: suggestion.category,
    preferredSizeText: suggestion.sizeText,
  };
}

export function clearItemPreferences(item: ShoppingListItem): ShoppingListItem {
  return {
    ...clearItemProductPreferences(item),
    preferredBrand: undefined,
  };
}
