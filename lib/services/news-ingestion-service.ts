import type { NewsArticle } from "@/types";
import type {
  DataMode,
  NewsFetchRun,
  NewsProvider,
  RepositoryBundle,
  StoredNewsArticle,
} from "@/types/backend";
import { classifyAngle } from "@/lib/news/angles";
import { deduplicateArticles } from "@/lib/news/dedup";
import { scoreArticle } from "@/lib/news/ranking";
import { stableHash } from "@/lib/security/stable-id";

export interface NewsIngestionProviderStat {
  provider: string;
  query: string;
  status: "completed" | "failed";
  dataMode: DataMode;
  fetched: number;
  stored: number;
  errorCode?: string;
}

export interface NewsIngestionResult {
  fetched: number;
  stored: number;
  failed: number;
  providers: NewsIngestionProviderStat[];
}

function canonicalizeUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (
        key.toLocaleLowerCase("en-US").startsWith("utm_") ||
        ["spm", "from", "ref", "source"].includes(
          key.toLocaleLowerCase("en-US"),
        )
      ) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLocaleLowerCase("en-US");
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

function deduplicate(articles: NewsArticle[], now: number): NewsArticle[] {
  const ranked = articles.map((article) => ({
    article,
    score: scoreArticle(article.category, article, now),
    angle: classifyAngle({
      title: article.title,
      description: article.description,
      category: article.category,
      keywords: article.keywords,
    }),
  }));
  return deduplicateArticles(ranked).map((entry) => entry.article);
}

function toStored(
  article: NewsArticle,
  provider: string,
  fetchedAt: string,
): StoredNewsArticle | null {
  const canonicalUrl = canonicalizeUrl(article.sourceUrl);
  if (!canonicalUrl) return null;
  return {
    ...article,
    id: `art-${stableHash(canonicalUrl)}`,
    sourceUrl: canonicalUrl,
    canonicalUrl,
    provider,
    fetchedAt,
    contentHash: stableHash(
      `${article.title}|${article.description}|${article.content ?? ""}`,
    ),
    rawMetadata: {},
  };
}

export class NewsIngestionService {
  constructor(
    private readonly providers: NewsProvider[],
    private readonly repository: RepositoryBundle,
    private readonly now: () => number = Date.now,
    private readonly maxConcurrent = 4,
  ) {}

  async ingest(input: {
    queries: string[];
    from?: string;
    to?: string;
    limitPerProvider?: number;
  }): Promise<NewsIngestionResult> {
    const jobs = this.providers.flatMap((provider) =>
      Array.from(new Set(input.queries.map((query) => query.trim()).filter(Boolean)))
        .map((query) => ({ provider, query })),
    );
    const stats: NewsIngestionProviderStat[] = [];
    for (let offset = 0; offset < jobs.length; offset += this.maxConcurrent) {
      const batch = jobs.slice(offset, offset + this.maxConcurrent);
      const settled = await Promise.all(
        batch.map(({ provider, query }) =>
          this.ingestOne(provider, query, input).catch(
            (): NewsIngestionProviderStat => ({
              provider: provider.name,
              query,
              status: "failed",
              dataMode: "degraded",
              fetched: 0,
              stored: 0,
              errorCode: "PROVIDER_UNAVAILABLE",
            }),
          ),
        ),
      );
      stats.push(...settled);
    }
    return {
      fetched: stats.reduce((sum, item) => sum + item.fetched, 0),
      stored: stats.reduce((sum, item) => sum + item.stored, 0),
      failed: stats.filter((item) => item.status === "failed").length,
      providers: stats,
    };
  }

  private async ingestOne(
    provider: NewsProvider,
    query: string,
    input: {
      from?: string;
      to?: string;
      limitPerProvider?: number;
    },
  ): Promise<NewsIngestionProviderStat> {
    const startedMs = this.now();
    const startedAt = new Date(startedMs).toISOString();
    const runId = `fetch-${stableHash(`${provider.name}|${query}|${startedAt}`)}`;
    const baseRun: NewsFetchRun = {
      id: runId,
      provider: provider.name,
      query,
      status: "running",
      fetchedCount: 0,
      startedAt,
    };
    await this.repository.saveNewsFetchRun(baseRun);
    try {
      const fetched = await provider.search({
        query,
        from: input.from,
        to: input.to,
        limit: input.limitPerProvider ?? 30,
        language: "zh",
      });
      const fetchedAt = new Date(this.now()).toISOString();
      const storedArticles = deduplicate(fetched, this.now())
        .map((article) => toStored(article, provider.name, fetchedAt))
        .filter((article): article is StoredNewsArticle => article !== null);
      const stored = await this.repository.upsertArticles(storedArticles);
      await this.repository.saveNewsFetchRun({
        ...baseRun,
        status: "completed",
        fetchedCount: fetched.length,
        finishedAt: new Date(this.now()).toISOString(),
      });
      console.info(
        JSON.stringify({
          event: "news_provider_fetch",
          provider: provider.name,
          status: "completed",
          durationMs: this.now() - startedMs,
          count: fetched.length,
        }),
      );
      return {
        provider: provider.name,
        query,
        status: "completed",
        dataMode: provider.dataMode ?? "live",
        fetched: fetched.length,
        stored,
      };
    } catch {
      await this.repository.saveNewsFetchRun({
        ...baseRun,
        status: "failed",
        errorCode: "PROVIDER_UNAVAILABLE",
        finishedAt: new Date(this.now()).toISOString(),
      });
      console.warn(
        JSON.stringify({
          event: "news_provider_fetch",
          provider: provider.name,
          status: "failed",
          durationMs: this.now() - startedMs,
          count: 0,
        }),
      );
      throw new Error("PROVIDER_UNAVAILABLE");
    }
  }
}
