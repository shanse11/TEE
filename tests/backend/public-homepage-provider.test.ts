import { describe, expect, it, vi } from "vitest";
import {
  PUBLIC_HOMEPAGE_SOURCES,
  PublicHomepageNewsProvider,
} from "@/lib/news/providers/public-homepage-provider";
import { newsPlatform } from "@/lib/news/source-platform";

const CASES = [
  {
    id: "xinhua",
    href: "https://www.news.cn/tech/20260718/abc/c.html",
    title: "人工智能产业发布最新进展",
    category: "科技数码",
  },
  {
    id: "chinanews",
    href: "https://www.chinanews.com.cn/cj/2026/07-18/1066.shtml",
    title: "人工智能推动经济高质量发展",
    category: "商业财经",
  },
  {
    id: "gmw",
    href: "https://tech.gmw.cn/2026-07/18/content_123.htm",
    title: "人工智能技术加速应用落地",
    category: "科技数码",
  },
  {
    id: "stdaily",
    href: "https://www.stdaily.com/web/2026-07/18/content_456.html",
    title: "人工智能大模型取得研究突破",
    category: "科技数码",
  },
] as const;

describe("PublicHomepageNewsProvider", () => {
  it.each(CASES)(
    "解析 $id 官方首页文章并标记独立平台",
    async ({ id, href, title, category }) => {
      const source = PUBLIC_HOMEPAGE_SOURCES.find(
        (candidate) => candidate.id === id,
      );
      expect(source).toBeDefined();
      const fetcher = vi.fn().mockResolvedValue(
        new Response(
          `<a href="${href}" title="${title}"><span>${title}</span></a>
           <a href="https://example.com/2026-07/18/fake.html">人工智能外链</a>`,
          { status: 200 },
        ),
      );
      const provider = new PublicHomepageNewsProvider(source!, {
        fetcher: fetcher as unknown as typeof fetch,
        now: () => Date.parse("2026-07-18T12:00:00+08:00"),
      });

      const first = await provider.search({
        query: "人工智能",
        from: "2026-07-18T00:00:00+08:00",
        to: "2026-07-18T23:59:59+08:00",
        limit: 30,
      });
      const second = await provider.search({
        query: "科技数码",
        from: "2026-07-18T00:00:00+08:00",
        to: "2026-07-18T23:59:59+08:00",
        limit: 30,
      });

      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({ title, category });
      expect(newsPlatform(first[0])).toBe(source!.name);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(second.every((article) => article.source === source!.name)).toBe(
        true,
      );
    },
  );
});
