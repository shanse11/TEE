import { beforeEach, describe, expect, it } from "vitest";
import { GET as searchNews } from "@/app/api/news/search/route";
import { POST as generateDaily } from "@/app/api/daily-issue/generate/route";
import { POST as generateTheme } from "@/app/api/theme-poster/generate/route";
import { POST as generateTopic } from "@/app/api/topic-poster/generate/route";
import { POST as simulateDelivery } from "@/app/api/delivery/simulate/route";
import { GET as listCreations } from "@/app/api/creations/route";
import { resetServerContainerForTests } from "@/lib/server/container";
import { getDemoArticles } from "@/lib/news/providers/demo-provider";
import { MOCK_USER_ID } from "@/lib/mock/constants";

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function payload(response: Response) {
  return (await response.json()) as {
    data?: unknown;
    meta?: Record<string, unknown>;
    error?: Record<string, unknown>;
  };
}

beforeEach(() => {
  resetServerContainerForTests();
});

describe("后端 Route Handlers", () => {
  it("搜索接口返回统一 envelope、角度与本地数据集模式", async () => {
    const response = await searchNews(
      new Request(
        "http://localhost/api/news/search?q=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%E6%95%99%E8%82%B2&range=7d",
      ),
    );
    const body = await payload(response);
    expect(response.status).toBe(200);
    expect(body.meta?.dataMode).toBe("cache");
    expect(
      (body.data as { articles: unknown[] }).articles.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("三个生成接口在无外部服务时均可用", async () => {
    const dailyResponse = await generateDaily(
      jsonRequest("/api/daily-issue/generate", {
        userId: MOCK_USER_ID,
        issueDate: "2026-07-19",
        topics: ["人工智能", "科技数码", "商业财经"],
      }),
    );
    const themeResponse = await generateTheme(
      jsonRequest("/api/theme-poster/generate", {
        theme: "人工智能",
        articleCount: 4,
        summaryLength: "standard",
        template: "classic",
      }),
    );
    const topicResponse = await generateTopic(
      jsonRequest("/api/topic-poster/generate", {
        keyword: "人工智能教育",
        selectedArticleIds: getDemoArticles()
          .slice(0, 4)
          .map((article) => article.id),
        template: "classic",
      }),
    );

    expect(dailyResponse.status).toBe(200);
    expect(themeResponse.status).toBe(200);
    expect(topicResponse.status).toBe(200);
    expect(["cache", "demo"]).toContain(
      (await payload(dailyResponse)).meta?.dataMode,
    );

    const creationsResponse = await listCreations(
      new Request(
        "http://localhost/api/creations?type=daily_issue&offset=0&limit=20",
      ),
    );
    const creations = (await payload(creationsResponse)).data as {
      items: Array<{ href: string; saved: boolean }>;
      total: number;
    };
    expect(creationsResponse.status).toBe(200);
    expect(creations.total).toBeGreaterThanOrEqual(1);
    expect(
      creations.items.some(
        (creation) =>
          creation.saved &&
          creation.href.startsWith("/newspaper/daily-"),
      ),
    ).toBe(true);
  });

  it("模拟投递重复两次不会生成第二份日报", async () => {
    const input = {
      userId: MOCK_USER_ID,
      issueDate: "2026-07-20",
    };
    const first = await simulateDelivery(
      jsonRequest("/api/delivery/simulate", input),
    );
    const second = await simulateDelivery(
      jsonRequest("/api/delivery/simulate", input),
    );
    const firstData = (await payload(first)).data as {
      issue: { id: string };
    };
    const secondData = (await payload(second)).data as {
      issue: { id: string };
    };
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(secondData.issue.id).toBe(firstData.issue.id);
  });

  it("接口忽略 Body 与自定义 Header 中伪造的 userId", async () => {
    const request = jsonRequest("/api/daily-issue/generate", {
      userId: "forged-user",
      issueDate: "2026-07-21",
      topics: ["人工智能"],
    });
    request.headers.set("x-todaypaper-user-id", "forged-header-user");
    const response = await generateDaily(request);
    const body = await payload(response);
    expect((body.data as { userId: string }).userId).toBe(MOCK_USER_ID);
  });

  it("错误响应不包含 stack、供应商响应或用户额外字段", async () => {
    const response = await generateTopic(
      jsonRequest("/api/topic-poster/generate", {
        keyword: "",
        selectedArticleIds: ["a", "b"],
        template: "classic",
        privateMarker: "forbidden-secret-marker",
      }),
    );
    const text = await response.text();
    expect(response.status).toBe(400);
    expect(text).not.toContain("stack");
    expect(text).not.toContain("forbidden-secret-marker");
    expect(text).not.toContain("Authorization");
  });
});
