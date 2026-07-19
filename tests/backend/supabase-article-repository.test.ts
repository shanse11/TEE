import { describe, expect, it, vi } from "vitest";
import { SupabaseRepository } from "@/lib/repositories/supabase-repository";

describe("SupabaseRepository.findArticle", () => {
  it("从 news_articles 查询并映射文章，不再读取 Demo", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("/rest/v1/news_articles?");
      return Response.json([
        {
          id: "art-live",
          canonical_url: "https://news.example.com/live",
          provider: "rss",
          source: "Live News",
          title: "实时新闻",
          description: "实时摘要",
          content_excerpt: null,
          image_url: null,
          category: "科技",
          keywords: ["实时"],
          published_at: "2026-07-18T00:00:00.000Z",
          fetched_at: "2026-07-18T00:01:00.000Z",
          content_hash: "hash",
          raw_metadata: {},
        },
      ]);
    });
    const repository = new SupabaseRepository({
      baseUrl: "https://project.supabase.co",
      serviceRoleKey: "test-service-role",
      fetcher,
    });
    await expect(repository.findArticle("art-live")).resolves.toMatchObject({
      id: "art-live",
      source: "Live News",
      sourceUrl: "https://news.example.com/live",
    });
  });
});
