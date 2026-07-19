import type { NewsArticle } from "@/types";
import type {
  DataMode,
  NewsProvider,
  NewsSearchInput,
} from "@/types/backend";
import { DemoNewsProvider } from "@/lib/news/providers/demo-provider";

/**
 * 聚合多个 NewsProvider。单个数据源失败不影响其他数据源；
 * 所有源失败时回退 DemoNewsProvider。合并后按 id 与规范化 URL 粗粒去重。
 * 模糊去重（标题相似度）由排序阶段 rank.ts 负责。
 */

export interface CompositeNewsProviderOptions {
  providers?: NewsProvider[];
  fallback?: NewsProvider;
  maxConcurrent?: number;
  allowFallback?: boolean;
}

export class CompositeNewsProvider implements NewsProvider {
  readonly name = "composite";
  lastDataMode: DataMode = "demo";
  private readonly providers: NewsProvider[];
  private readonly fallback: NewsProvider;
  private readonly maxConcurrent: number;
  private readonly allowFallback: boolean;

  constructor(options: CompositeNewsProviderOptions = {}) {
    this.providers = options.providers ?? [];
    this.fallback = options.fallback ?? new DemoNewsProvider();
    this.maxConcurrent = Math.min(options.maxConcurrent ?? 5, 5);
    this.allowFallback = options.allowFallback ?? true;
  }

  async search(
    input: NewsSearchInput,
    signal?: AbortSignal,
  ): Promise<NewsArticle[]> {
    if (this.providers.length === 0) {
      if (this.allowFallback) {
        this.lastDataMode = "demo";
        return this.fallback.search(input, signal);
      }
      this.lastDataMode = "degraded";
      return [];
    }

    const results = await this.runProviders(input, signal);
    const merged = mergeArticles(results.map((r) => r.articles));

    if (merged.length === 0) {
      if (this.allowFallback) {
        this.lastDataMode = "demo";
        return this.fallback.search(input, signal);
      }
      this.lastDataMode = "degraded";
      return [];
    }
    this.lastDataMode = resolveDataMode(results);
    return merged;
  }

  private async runProviders(
    input: NewsSearchInput,
    signal?: AbortSignal,
  ): Promise<Array<{ provider: NewsProvider; articles: NewsArticle[] }>> {
    // 分批并发，限制最大并发数。
    const batches: NewsProvider[][] = [];
    for (let i = 0; i < this.providers.length; i += this.maxConcurrent) {
      batches.push(this.providers.slice(i, i + this.maxConcurrent));
    }

    const output: Array<{ provider: NewsProvider; articles: NewsArticle[] }> = [];
    for (const batch of batches) {
      const settled = await Promise.allSettled(
        batch.map((provider) => provider.search(input, signal)),
      );
      for (const [index, result] of settled.entries()) {
        if (result.status === "fulfilled") {
          output.push({
            provider: batch[index],
            articles: result.value,
          });
        }
        // rejected 的单个源被忽略，不影响其他源。
      }
    }
    return output;
  }
}

function resolveDataMode(
  results: ReadonlyArray<{ provider: NewsProvider; articles: NewsArticle[] }>,
): DataMode {
  const modes = results
    .filter((result) => result.articles.length > 0)
    .map((result) => {
      if (result.provider.dataMode) {
        return result.provider.dataMode;
      }
      return result.provider.name === "demo" ? "demo" : "live";
    });
  if (modes.includes("live")) {
    return "live";
  }
  if (modes.includes("cache")) {
    return "cache";
  }
  return "demo";
}

/** 按 id 与规范化 URL 粗粒去重合并。 */
function mergeArticles(lists: ReadonlyArray<NewsArticle[]>): NewsArticle[] {
  const seenId = new Set<string>();
  const seenUrl = new Set<string>();
  const result: NewsArticle[] = [];

  for (const article of lists.flat()) {
    if (seenId.has(article.id)) {
      continue;
    }
    const urlKey = article.sourceUrl
      ? normalizeUrlKey(article.sourceUrl)
      : null;
    if (urlKey && seenUrl.has(urlKey)) {
      continue;
    }
    seenId.add(article.id);
    if (urlKey) {
      seenUrl.add(urlKey);
    }
    result.push(article);
  }
  return result;
}

function normalizeUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    // 去除查询参数与片段，统一小写主机。
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}
