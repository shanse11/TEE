import { describe, expect, it } from "vitest";
import type { LLMClient, NewsProvider } from "@/types/backend";
import { MockLLMClient } from "@/lib/ai/mock-client";
import { MemoryRepository } from "@/lib/repositories/memory-repository";
import { DailyIssueService } from "@/lib/services/daily-issue-service";
import { NewsSearchService } from "@/lib/services/news-search-service";
import { shanghaiDate } from "@/lib/time/shanghai";
import type { NewsArticle } from "@/types";

const NOW = Date.parse("2026-07-17T16:30:00.000Z");

describe("生产行为边界", () => {
  it("北京时间日期不依赖运行时 UTC 日期", () => {
    expect(shanghaiDate(NOW)).toBe("2026-07-18");
  });

  it("启用订阅的自定义 keywords 会进入日报搜索", async () => {
    const queries: string[] = [];
    const articles: NewsArticle[] = Array.from({ length: 6 }, (_, index) => ({
      id: `live-${index}`,
      title: `量子芯片新闻 ${index}`,
      description: `量子芯片产业取得进展 ${index}`,
      source: "Live Source",
      sourceUrl: `https://news.example.com/${index}`,
      publishedAt: new Date(NOW - index * 1000).toISOString(),
      category: "科技",
      keywords: ["量子芯片"],
    }));
    const provider: NewsProvider = {
      name: "recording",
      dataMode: "live",
      async search(input) {
        queries.push(input.query);
        return articles;
      },
    };
    const repository = new MemoryRepository();
    const now = new Date(NOW).toISOString();
    await repository.replaceSubscriptions(
      "keyword-user",
      [
        {
          id: "sub-keyword",
          userId: "keyword-user",
          topic: "科技数码",
          keywords: ["量子芯片"],
          enabled: true,
          todayUpdateCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      ],
      { email: "", dailyDelivery: false, deliveryTime: "08:00" },
    );
    const service = new DailyIssueService(
      new NewsSearchService(provider, () => NOW),
      new MockLLMClient(),
      repository,
      () => NOW,
      false,
    );
    await service.generate({
      userId: "keyword-user",
      topics: ["会被订阅覆盖"],
    });
    expect(queries).toContain("科技数码");
    expect(queries).toContain("量子芯片");
  });

  it("生产模式新闻不足时不混入 Demo 数据", async () => {
    const empty: NewsProvider = {
      name: "empty",
      dataMode: "live",
      async search() {
        return [];
      },
    };
    const repository = new MemoryRepository();
    const unavailableLlm: LLMClient = {
      async generateStructured<T>(): Promise<T> {
        throw new Error("unavailable");
      },
    };
    const service = new DailyIssueService(
      new NewsSearchService(empty, () => NOW, empty),
      unavailableLlm,
      repository,
      () => NOW,
      false,
    );
    await expect(
      service.generate({
        userId: "production-user",
        topics: ["不存在的实时主题"],
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ARTICLES" });
  });
});
