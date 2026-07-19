import { describe, expect, it, vi } from "vitest";
import { GenericNewsApiProvider } from "@/lib/news/providers/generic-api-provider";

function newsResponse(status = 200): Response {
  return new Response(
    JSON.stringify({
      articles: [
        {
          title: "人工智能教育进入课堂评估阶段",
          description: "多地学校开始评估人工智能辅助教学。",
          content: "这是一段经过规范化处理的新闻正文。",
          url: "https://example.com/news/ai-education",
          publishedAt: "2026-07-18T08:00:00.000Z",
          source: { name: "测试新闻源" },
        },
      ],
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("GenericNewsApiProvider", () => {
  it("校验外部响应并补充搜索主题字段", async () => {
    const fetcher = vi.fn().mockResolvedValue(newsResponse());
    const provider = new GenericNewsApiProvider({
      apiKey: "test-token",
      fetcher: fetcher as unknown as typeof fetch,
    });

    const articles = await provider.search({
      query: "人工智能教育",
      language: "zh",
      limit: 10,
    });

    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      category: "人工智能教育",
      keywords: ["人工智能教育"],
      source: "测试新闻源",
      sourceUrl: "https://example.com/news/ai-education",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("429/5xx 只重试一次", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(newsResponse(503))
      .mockResolvedValueOnce(newsResponse());
    const provider = new GenericNewsApiProvider({
      apiKey: "test-token",
      fetcher: fetcher as unknown as typeof fetch,
    });

    await expect(
      provider.search({ query: "机器人", language: "zh" }),
    ).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("普通 4xx 不重试", async () => {
    const fetcher = vi.fn().mockResolvedValue(newsResponse(400));
    const provider = new GenericNewsApiProvider({
      apiKey: "test-token",
      fetcher: fetcher as unknown as typeof fetch,
    });

    await expect(
      provider.search({ query: "机器人", language: "zh" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
