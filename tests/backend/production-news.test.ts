import { describe, expect, it, vi } from "vitest";
import type { NewsProvider } from "@/types/backend";
import { MemoryRepository } from "@/lib/repositories/memory-repository";
import { DatabaseNewsProvider } from "@/lib/news/providers/database-news-provider";
import { RssNewsProvider } from "@/lib/news/providers/rss-news-provider";
import { NewsIngestionService } from "@/lib/services/news-ingestion-service";
import { NewsSearchService } from "@/lib/services/news-search-service";

const NOW = Date.parse("2026-07-18T02:00:00.000Z");

function rssResponse() {
  return new Response(
    `<?xml version="1.0"?><rss><channel><item>
      <title>人工智能教育发布新方案</title>
      <description>多所学校开始采用新的人工智能课程方案。</description>
      <link>https://news.example.com/ai-education?utm_source=test</link>
      <guid>source-guid</guid>
      <pubDate>Sat, 18 Jul 2026 01:00:00 GMT</pubDate>
    </item></channel></rss>`,
    { status: 200, headers: { "content-type": "application/rss+xml" } },
  );
}

describe("生产新闻链路", () => {
  it("RSS 独立解析并规范化官方配置源", async () => {
    const provider = new RssNewsProvider({
      sources: [
        {
          name: "Example News",
          url: "https://news.example.com/feed.xml",
          category: "教育",
          language: "zh",
        },
      ],
      fetcher: async () => rssResponse(),
    });
    const items = await provider.search({
      query: "人工智能教育",
      limit: 10,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: "Example News",
      category: "教育",
      sourceUrl: "https://news.example.com/ai-education?utm_source=test",
    });
  });

  it("入库幂等，且新服务实例可从数据库按稳定 ID 查询", async () => {
    const repository = new MemoryRepository();
    const provider = new RssNewsProvider({
      sources: [
        {
          name: "Example News",
          url: "https://news.example.com/feed.xml",
          category: "教育",
          language: "zh",
        },
      ],
      fetcher: async () => rssResponse(),
    });
    const ingestion = new NewsIngestionService(
      [provider],
      repository,
      () => NOW,
    );
    await ingestion.ingest({ queries: ["人工智能教育"] });
    await ingestion.ingest({ queries: ["人工智能教育"] });

    const database = new DatabaseNewsProvider(repository, 24 * 60 * 60);
    const first = await database.search({
      query: "人工智能教育",
      limit: 10,
    });
    const stored = first.find((article) => article.source === "Example News");
    expect(stored).toBeDefined();
    const article = await repository.findArticle(stored?.id ?? "");
    expect(article?.sourceUrl).toBe("https://news.example.com/ai-education");

    const restarted = new NewsSearchService(
      database,
      () => NOW,
      database,
    );
    const result = await restarted.search({
      query: "人工智能教育",
      timeRange: "24h",
      limit: 10,
    });
    expect(result.items.some((item) => item.id === stored?.id)).toBe(true);
  });

  it("单个实时 Provider 失败不影响其他 Provider 入库", async () => {
    const repository = new MemoryRepository();
    const failing: NewsProvider = {
      name: "failing",
      dataMode: "live",
      async search() {
        throw new Error("offline");
      },
    };
    const working = new RssNewsProvider({
      sources: [
        {
          name: "Example News",
          url: "https://news.example.com/feed.xml",
          category: "教育",
          language: "zh",
        },
      ],
      fetcher: async () => rssResponse(),
    });
    const result = await new NewsIngestionService(
      [failing, working],
      repository,
      () => NOW,
    ).ingest({ queries: ["人工智能教育"] });
    expect(result.failed).toBe(1);
    expect(result.stored).toBe(1);
  });

  it("缓存条数足够但来源不足五个时仍继续请求在线 Provider", async () => {
    const repository = new MemoryRepository(false);
    await repository.upsertArticles(
      Array.from({ length: 6 }, (_, index) => ({
        id: `people-cache-${index}`,
        title: `人工智能教育进展 ${index}`,
        description: `人工智能教育相关报道 ${index}`,
        source: "人民网",
        sourceUrl: `https://politics.people.com.cn/n1/2026/0718/cache-${index}.html`,
        canonicalUrl: `https://politics.people.com.cn/n1/2026/0718/cache-${index}.html`,
        provider: "local-dataset",
        fetchedAt: new Date().toISOString(),
        contentHash: `hash-${index}`,
        publishedAt: new Date(NOW - index * 1000).toISOString(),
        category: "教育",
        keywords: ["人工智能教育"],
      })),
    );
    const search = vi.fn().mockResolvedValue([
      {
        id: "tencent-live",
        title: "人工智能教育应用发布新进展",
        description: "腾讯新闻报道人工智能教育应用的新进展。",
        source: "腾讯新闻",
        sourceUrl: "https://new.qq.com/rain/a/20260718A01",
        publishedAt: new Date(NOW - 10_000).toISOString(),
        category: "教育",
        keywords: ["人工智能教育"],
      },
    ]);
    const liveProvider: NewsProvider = {
      name: "authorized-news-api",
      dataMode: "live",
      search,
    };
    const ingestion = new NewsIngestionService(
      [liveProvider],
      repository,
      () => NOW,
    );
    const service = new NewsSearchService(
      liveProvider,
      () => NOW,
      liveProvider,
      repository,
      ingestion,
    );

    const result = await service.search({
      query: "人工智能教育",
      timeRange: "24h",
      limit: 10,
    });

    expect(search).toHaveBeenCalledTimes(1);
    expect(
      result.items.some((article) => article.source === "腾讯新闻"),
    ).toBe(true);
    expect(result.dataMode).toBe("live");
  });
});
