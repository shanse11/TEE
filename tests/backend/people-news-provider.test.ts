import { describe, expect, it, vi } from "vitest";
import { PeopleNewsProvider } from "@/lib/news/providers/people-news-provider";

const HTML = `
  <a href="http://politics.people.com.cn/n1/2026/0718/c1001-1.html">
    人工智能发展带来时代之问
  </a>
  <a href="http://finance.people.com.cn/n1/2026/0718/c1004-2.html">
    全球人工智能创新指数报告发布
  </a>
  <a href="http://health.people.com.cn/n1/2026/0718/c14739-3.html">
    医疗服务持续改善群众健康生活
  </a>
  <a href="https://example.com/n1/2026/0718/not-people.html">外部链接</a>
`;

describe("PeopleNewsProvider", () => {
  it("只解析人民网公开页面中的当日文章并复用 120 秒缓存", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const provider = new PeopleNewsProvider({
      fetcher: fetcher as unknown as typeof fetch,
      now: () => Date.parse("2026-07-18T12:00:00+08:00"),
    });

    const ai = await provider.search({
      query: "人工智能",
      from: "2026-07-18T00:00:00+08:00",
      to: "2026-07-18T23:59:59+08:00",
      limit: 30,
    });
    const health = await provider.search({
      query: "健康生活",
      from: "2026-07-18T00:00:00+08:00",
      to: "2026-07-18T23:59:59+08:00",
      limit: 30,
    });

    expect(ai).toHaveLength(2);
    expect(ai.every((article) => article.source === "人民网")).toBe(true);
    expect(health).toHaveLength(1);
    expect(health[0].category).toBe("健康生活");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
