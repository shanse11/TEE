import { newsSearchQuerySchema } from "@/lib/api/schemas";
import { getServerContainer } from "@/lib/server/container";
import { distinctNewsPlatforms } from "@/lib/news/source-platform";
import {
  parseValue,
  resolveUserId,
  withApiHandler,
} from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApiHandler(request, "/api/news/search", async () => {
    await resolveUserId(request);
    const url = new URL(request.url);
    const input = parseValue(newsSearchQuerySchema, {
      q: url.searchParams.get("q") ?? url.searchParams.get("keyword") ?? "",
      range:
        url.searchParams.get("range") ??
        url.searchParams.get("timeRange") ??
        "7d",
      limit: url.searchParams.get("limit") ?? "20",
    });
    const result = await getServerContainer().news.search({
      query: input.q,
      timeRange: input.range,
      limit: input.limit,
    });
    const debugScores =
      process.env.DEBUG_NEWS_SCORES === "true" &&
      process.env.NODE_ENV !== "production";
    const articles = result.ranked.map((entry) => ({
      ...entry.article,
      angle: entry.angle,
      relevanceScore: entry.score.total,
      ...(debugScores ? { scoreBreakdown: entry.score } : {}),
    }));
    const sources = distinctNewsPlatforms(articles);
    return {
      data: {
        query: input.q,
        timeRange: input.range,
        items: articles,
        articles,
        total: articles.length,
        sources,
        sourceCount: sources.length,
        dataMode: result.dataMode,
        freshness: new Date().toISOString(),
      },
      dataMode: result.dataMode,
    };
  });
}
