import type { NewsArticle } from "@/types";
import demoNewsJson from "@/data/demo/news-articles.json";
import type { NewsProvider, NewsSearchInput } from "@/types/backend";
import { normalizeArticles, type RawArticle } from "@/lib/news/normalize";
import {
  clampNewsLimit,
  matchesNewsQuery,
  withinNewsTimeRange,
} from "@/lib/news/providers/query-filter";

/**
 * 演示新闻源。从 data/demo/news-articles.json 读取，无网络即可工作。
 * 用于演示、测试和外部服务降级。支持 query、时间范围和 limit。
 */

// 模块级缓存，保证稳定且不每次重新解析。
const demoArticles: NewsArticle[] = normalizeArticles(
  demoNewsJson as ReadonlyArray<RawArticle>,
);

export class DemoNewsProvider implements NewsProvider {
  readonly name = "demo";
  readonly dataMode = "demo" as const;

  async search(
    input: NewsSearchInput,
  ): Promise<NewsArticle[]> {
    const limit = clampNewsLimit(input.limit);
    const result = demoArticles.filter(
      (article) =>
        matchesNewsQuery(article, input.query) &&
        withinNewsTimeRange(article, input.from, input.to),
    );
    return result.slice(0, limit);
  };
}

/** 供测试与其他模块直接读取已规范化的演示文章。 */
export function getDemoArticles(): NewsArticle[] {
  return demoArticles.map((article) => ({ ...article }));
}
