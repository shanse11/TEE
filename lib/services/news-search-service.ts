import type {
  NewsAngle,
  NewsArticle,
  NewsTimeRange,
  SearchNewsItem,
} from "@/types";
import type {
  DataMode,
  NewsProvider,
  RankedNewsArticle,
  RankedSearchResult,
  RepositoryBundle,
} from "@/types/backend";
import { BackendError } from "@/lib/errors";
import { ERROR_CODES } from "@/types/backend";
import { classifyAngle, diversifySelection } from "@/lib/news/angles";
import { deduplicateArticles } from "@/lib/news/dedup";
import { rankNews, timeRangeToMs } from "@/lib/news/rank";
import { scoreArticle } from "@/lib/news/ranking";
import { DemoNewsProvider } from "@/lib/news/providers/demo-provider";
import {
  distinctNewsPlatforms,
  newsPlatform,
} from "@/lib/news/source-platform";
import { INPUT_LIMITS } from "@/lib/security/limits";
import type { NewsIngestionService } from "@/lib/services/news-ingestion-service";

type CacheEntry = {
  expiresAt: number;
  result: RankedSearchResult;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function providerMode(provider: NewsProvider, fallback: DataMode): DataMode {
  if (provider.name === "demo") {
    return "demo";
  }
  if (
    "lastDataMode" in provider &&
    (provider.lastDataMode === "live" ||
      provider.lastDataMode === "cache" ||
      provider.lastDataMode === "degraded" ||
      provider.lastDataMode === "demo")
  ) {
    return provider.lastDataMode;
  }
  return fallback;
}

function hasSufficientCoverage(
  articles: NewsArticle[],
  limit: number,
): boolean {
  const minimumArticles = Math.min(6, limit);
  const minimumSources = Math.min(5, limit);
  return (
    articles.length >= minimumArticles &&
    distinctNewsPlatforms(articles).length >= minimumSources
  );
}

export interface SearchServiceInput {
  query: string;
  timeRange?: NewsTimeRange;
  limit?: number;
}

export class NewsSearchService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly articleIndex = new Map<string, NewsArticle>();

  constructor(
    private readonly provider: NewsProvider,
    private readonly now: () => number = Date.now,
    private readonly fallback: NewsProvider = new DemoNewsProvider(),
    private readonly repository?: RepositoryBundle,
    private readonly ingestion?: NewsIngestionService,
    private readonly cacheTtlSeconds = 600,
  ) {}

  async search(input: SearchServiceInput): Promise<RankedSearchResult> {
    const query = input.query.trim();
    if (query.length === 0 || query.length > INPUT_LIMITS.maxQueryLength) {
      throw new BackendError({
        code: ERROR_CODES.INVALID_INPUT,
        message: "请输入 1～50 个字符的搜索关键词。",
        retryable: false,
      });
    }

    const timeRange = input.timeRange ?? "7d";
    const limit = Math.min(
      Math.max(Math.floor(input.limit ?? 20), 1),
      INPUT_LIMITS.maxCandidateArticles,
    );
    const now = this.now();
    const key = `${query}\u0000${timeRange}\u0000${limit}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return {
        ...clone(cached.result),
        dataMode:
          cached.result.dataMode === "live"
            ? "cache"
            : cached.result.dataMode,
      };
    }

    let result: RankedSearchResult;
    const rangeMs = timeRangeToMs(timeRange);
    const from = new Date(now - rangeMs).toISOString();
    const to = new Date(now).toISOString();

    if (this.repository) {
      const fresh = await this.repository.searchArticles({
        query,
        from,
        to,
        limit,
        maxAgeSeconds: this.cacheTtlSeconds,
      });
      if (hasSufficientCoverage(fresh, limit)) {
        const ranked = this.rankArticles({
          query,
          articles: fresh,
          limit,
          diversify: false,
        });
        result = { ...ranked, dataMode: "cache" };
        this.cacheResult(key, result, now);
        return clone(result);
      }

      if (this.ingestion) {
        const ingestion = await this.ingestion.ingest({
          queries: [query],
          from,
          to,
          limitPerProvider: limit,
        });
        const stored = await this.repository.searchArticles({
          query,
          from,
          to,
          limit,
        });
        const merged = Array.from(
          new Map(
            [...fresh, ...stored].map((article) => [article.id, article]),
          ).values(),
        );
        const ranked = this.rankArticles({
          query,
          articles: merged,
          limit,
          diversify: false,
        });
        const successfulModes = ingestion.providers
          .filter(
            (item) => item.status === "completed" && item.fetched > 0,
          )
          .map((item) => item.dataMode);
        const ingestionMode: DataMode =
          ingestion.providers.length === 0 ||
          ingestion.failed === ingestion.providers.length
            ? "degraded"
            : successfulModes.includes("live")
              ? "live"
              : successfulModes.includes("cache")
                ? "cache"
                : successfulModes.includes("demo")
                  ? "demo"
                  : "degraded";
        result = {
          ...ranked,
          dataMode: ingestionMode,
        };
        this.cacheResult(key, result, now);
        return clone(result);
      }
    }

    try {
      result = await rankNews({
        query,
        timeRange,
        provider: this.provider,
        now,
        limit,
        dataMode: "live",
      });
      result.dataMode = providerMode(this.provider, "live");
    } catch {
      result = await rankNews({
        query,
        timeRange,
        provider: this.fallback,
        now,
        limit,
        dataMode: "demo",
      });
    }

    for (const item of result.items) {
      this.articleIndex.set(item.id, item);
    }
    this.cacheResult(key, result, now);
    return result;
  }

  private cacheResult(
    key: string,
    result: RankedSearchResult,
    now: number,
  ): void {
    this.cache.set(key, {
      expiresAt: now + 60_000,
      result: clone(result),
    });
  }

  findKnownArticle(id: string): NewsArticle | null {
    const article = this.articleIndex.get(id);
    return article ? clone(article) : null;
  }

  rankArticles(input: {
    query: string;
    articles: NewsArticle[];
    limit: number;
    diversify: boolean;
  }): {
    items: SearchNewsItem[];
    ranked: RankedNewsArticle[];
  } {
    const query = input.query.trim();
    if (query.length === 0) {
      throw new BackendError({
        code: ERROR_CODES.INVALID_INPUT,
        message: "请输入有效的关键词。",
        retryable: false,
      });
    }
    const now = this.now();
    const ranked = input.articles.map((article) => ({
      article,
      score: scoreArticle(query, article, now),
      angle: classifyAngle({
        title: article.title,
        description: article.description,
        keywords: article.keywords,
        category: article.category,
      }) as NewsAngle,
    }));
    const deduped = deduplicateArticles(ranked).sort(
      (a, b) => b.score.total - a.score.total,
    );
    let selected: RankedNewsArticle[];
    if (input.diversify) {
      const diverse = diversifySelection(deduped, {
        targetCount: Math.min(input.limit, 5),
      });
      const selectedIds = new Set(
        diverse.map((entry) => entry.article.id),
      );
      selected = [
        ...diverse,
        ...deduped.filter(
          (entry) => !selectedIds.has(entry.article.id),
        ),
      ].slice(0, input.limit);
    } else {
      const representatives: RankedNewsArticle[] = [];
      const representativeIds = new Set<string>();
      const representedPlatforms = new Set<string>();
      for (const entry of deduped) {
        const platform = newsPlatform(entry.article);
        if (
          representedPlatforms.has(platform) ||
          representatives.length >= Math.min(5, input.limit)
        ) {
          continue;
        }
        representedPlatforms.add(platform);
        representativeIds.add(entry.article.id);
        representatives.push(entry);
      }
      selected = [
        ...representatives,
        ...deduped.filter(
          (entry) => !representativeIds.has(entry.article.id),
        ),
      ].slice(0, input.limit);
    }
    return {
      ranked: selected,
      items: selected.map((entry) => ({
        ...entry.article,
        angle: entry.angle,
        relevanceScore: entry.score.total,
      })),
    };
  }
}
