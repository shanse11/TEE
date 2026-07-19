import type { NewsArticle } from "@/types";

/** 对中文无空格查询同时支持完整短语与相邻二元词组匹配。 */
export function matchesNewsQuery(
  article: NewsArticle,
  query: string,
): boolean {
  const keyword = query.trim().toLocaleLowerCase("zh-CN");
  if (keyword.length === 0) {
    return false;
  }
  const haystack = [
    article.title,
    article.description,
    article.category,
    ...article.keywords,
  ]
    .join(" ")
    .toLocaleLowerCase("zh-CN");
  if (haystack.includes(keyword)) {
    return true;
  }

  const tokens = new Set(
    keyword
      .split(/\s+/)
      .filter(Boolean)
      .concat(
        Array.from({ length: Math.max(0, keyword.length - 1) }, (_, index) =>
          keyword.slice(index, index + 2),
        ),
      ),
  );
  let matched = 0;
  for (const token of tokens) {
    if (token.length > 0 && haystack.includes(token)) {
      matched += 1;
    }
  }
  return matched >= Math.min(2, tokens.size);
}

export function withinNewsTimeRange(
  article: NewsArticle,
  from?: string,
  to?: string,
): boolean {
  const published = Date.parse(article.publishedAt);
  if (Number.isNaN(published)) {
    return false;
  }
  if (from) {
    const fromMs = Date.parse(from);
    if (!Number.isNaN(fromMs) && published < fromMs) {
      return false;
    }
  }
  if (to) {
    const toMs = Date.parse(to);
    if (!Number.isNaN(toMs) && published > toMs) {
      return false;
    }
  }
  return true;
}

export function clampNewsLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return 50;
  }
  return Math.min(Math.floor(limit), 50);
}
