import { rankNewsRequestSchema } from "@/lib/api/schemas";
import { getServerContainer } from "@/lib/server/container";
import {
  parseJsonBody,
  resolveUserId,
  withApiHandler,
} from "@/lib/server/http";
import { enforceWriteRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withApiHandler(request, "/api/news/rank", async () => {
    const container = getServerContainer();
    await resolveUserId(request);
    await enforceWriteRateLimit(
      request,
      "/api/news/rank",
      container.rateLimit,
    );
    const input = await parseJsonBody(request, rankNewsRequestSchema);
    const result = container.news.rankArticles({
      query: input.keyword,
      articles: input.articles,
      limit: input.limit,
      diversify: input.diversify,
    });
    return {
      data: {
        items: result.items,
        articles: result.items,
        total: result.items.length,
      },
      dataMode: "demo",
    };
  });
}
