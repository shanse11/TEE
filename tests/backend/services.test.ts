import { describe, expect, it } from "vitest";
import type {
  LLMClient,
} from "@/types/backend";
import { DemoNewsProvider } from "@/lib/news/providers/demo-provider";
import { NewsSearchService } from "@/lib/services/news-search-service";
import { MemoryRepository } from "@/lib/repositories/memory-repository";
import { DailyIssueService } from "@/lib/services/daily-issue-service";
import {
  ThemePosterService,
  TopicPosterService,
} from "@/lib/services/poster-services";
import { MockLLMClient } from "@/lib/ai/mock-client";
import { getDemoArticles } from "@/lib/news/providers/demo-provider";

const NOW = Date.parse("2026-07-18T12:00:00.000Z");

class UnavailableLLMClient implements LLMClient {
  async generateStructured<T>(): Promise<T> {
    throw new Error("AI unavailable");
  }
}

function createServices(llm: LLMClient = new MockLLMClient()) {
  const repository = new MemoryRepository();
  const news = new NewsSearchService(
    new DemoNewsProvider(),
    () => NOW,
  );
  return {
    repository,
    daily: new DailyIssueService(news, llm, repository, () => NOW),
    theme: new ThemePosterService(news, llm, repository, () => NOW),
    topic: new TopicPosterService(news, llm, repository, () => NOW),
  };
}

describe("领域 Service", () => {
  it("AI 不可用时仍生成可渲染日报，并保持幂等", async () => {
    const { daily } = createServices(new UnavailableLLMClient());
    const input = {
      userId: "demo-user",
      issueDate: "2026-07-19",
      topics: ["人工智能", "科技数码", "商业财经"],
    };
    const first = await daily.generate(input);
    const second = await daily.generate(input);

    expect(first.data.sections.length).toBeGreaterThan(0);
    expect(first.data.dailyBriefing.length).toBeGreaterThan(0);
    expect(first.dataMode).toBe("demo");
    expect(second.data.id).toBe(first.data.id);
    expect(second.status).toBe("existing");
  });

  it("强制刷新时按当前启用订阅替换同日旧日报", async () => {
    const { daily, repository } = createServices();
    const now = new Date(NOW).toISOString();
    await repository.replaceSubscriptions(
      "demo-user",
      [
        {
          id: "sub-business",
          userId: "demo-user",
          topic: "商业财经",
          keywords: ["企业"],
          enabled: true,
          todayUpdateCount: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "sub-health",
          userId: "demo-user",
          topic: "健康生活",
          keywords: ["医疗"],
          enabled: true,
          todayUpdateCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      ],
      { email: "", dailyDelivery: false, deliveryTime: "08:00" },
    );

    const refreshed = await daily.generate({
      userId: "demo-user",
      issueDate: "2026-07-18",
      topics: ["旧方向"],
      forceRefresh: true,
    });

    expect(refreshed.data.topics).toEqual(["商业财经", "健康生活"]);
    expect(refreshed.data.sections.map((section) => section.title)).toEqual(
      expect.arrayContaining(["商业财经", "健康生活"]),
    );
    expect(refreshed.data.dailyBriefing).toContain("商业财经");
    expect(refreshed.data.dailyBriefing).toContain("健康生活");
  });

  it("主题海报在 Mock AI 下生成 3～5 篇", async () => {
    const { theme } = createServices();
    const result = await theme.generate({
      userId: "demo-user",
      theme: "人工智能",
      articleCount: 4,
      summaryLength: "standard",
      template: "classic",
    });
    expect(result.data.articles).toHaveLength(4);
    expect(result.dataMode).toBe("demo");
  });

  it("关键词专题保持 selectedArticleIds 顺序", async () => {
    const { topic } = createServices();
    const ids = getDemoArticles()
      .slice(0, 4)
      .map((article) => article.id)
      .reverse();
    const result = await topic.generate({
      userId: "demo-user",
      keyword: "人工智能教育",
      selectedArticleIds: ids,
      template: "modern",
    });
    expect(result.data.articles.map((article) => article.id)).toEqual(ids);
  });

  it("关键词专题拒绝重复文章 ID", async () => {
    const { topic } = createServices();
    await expect(
      topic.generate({
        userId: "demo-user",
        keyword: "人工智能教育",
        selectedArticleIds: ["a", "a", "b"],
        template: "classic",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
