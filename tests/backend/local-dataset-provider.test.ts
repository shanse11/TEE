import { describe, expect, it } from "vitest";
import {
  getLocalDatasetArticles,
  getLocalDatasetStats,
  LocalDatasetNewsProvider,
} from "@/lib/news/providers/local-dataset-provider";

const DAY_START = "2026-07-01T00:00:00.000Z";
const DAY_END = "2026-07-18T23:59:59.999Z";

describe("LocalDatasetNewsProvider", () => {
  it("加载并规范化全部本地批次", () => {
    const stats = getLocalDatasetStats();
    expect(stats).toEqual({
      fileCount: 10,
      invalidFileCount: 0,
      rawArticleCount: 203,
      normalizedArticleCount: 203,
      uniqueArticleCount: 164,
      duplicateUrlGroups: 32,
      duplicateRecordsMerged: 39,
    });
  });

  it("保留唯一 ID，并按 URL 合并跨分类记录", () => {
    const articles = getLocalDatasetArticles();
    const ids = new Set(articles.map((article) => article.id));
    const urls = articles
      .map((article) => article.sourceUrl)
      .filter((url): url is string => Boolean(url));

    expect(ids.size).toBe(articles.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it.each([
    "人工智能",
    "体育赛事",
    "健康生活",
    "商业财经",
    "学术科研",
    "政治时政",
    "电影娱乐",
    "科技数码",
  ])("可以按数据集分类搜索：%s", async (query) => {
    const provider = new LocalDatasetNewsProvider();
    const result = await provider.search({
      query,
      from: DAY_START,
      to: DAY_END,
      limit: 50,
    });
    expect(result.length).toBeGreaterThan(0);
  });

  it("应用时间范围和 limit", async () => {
    const provider = new LocalDatasetNewsProvider();
    const result = await provider.search({
      query: "科技数码",
      from: "2026-07-17T00:00:00.000Z",
      to: DAY_END,
      limit: 3,
    });
    expect(result.length).toBeLessThanOrEqual(3);
    expect(
      result.every(
        (article) => Date.parse(article.publishedAt) >= Date.parse("2026-07-17"),
      ),
    ).toBe(true);
  });
});
