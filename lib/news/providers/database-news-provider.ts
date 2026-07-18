import type { NewsArticle } from "@/types";
import type {
  NewsProvider,
  NewsSearchInput,
  RepositoryBundle,
} from "@/types/backend";

/** 只读数据库新闻源。认证与 Service Role 边界由 Repository 负责。 */
export class DatabaseNewsProvider implements NewsProvider {
  readonly name = "database";
  readonly dataMode = "cache" as const;

  constructor(
    private readonly repository: RepositoryBundle,
    private readonly maxAgeSeconds = 600,
  ) {}

  async search(input: NewsSearchInput): Promise<NewsArticle[]> {
    return this.repository.searchArticles({
      query: input.query,
      from: input.from,
      to: input.to,
      limit: input.limit ?? 20,
      maxAgeSeconds: this.maxAgeSeconds,
    });
  }
}
