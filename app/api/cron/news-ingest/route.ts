import { serverEnv } from "@/lib/config/env";
import { assertCronAuthorized } from "@/lib/server/cron-auth";
import { getServerContainer } from "@/lib/server/container";
import { withApiHandler } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_QUERIES = [
  "人工智能",
  "科技数码",
  "商业财经",
  "健康生活",
  "体育赛事",
  "政治时政",
];

function configuredQueries(): string[] {
  const configured = serverEnv.NEWS_INGEST_QUERIES?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return configured?.length ? configured.slice(0, 12) : DEFAULT_QUERIES;
}

export async function GET(request: Request): Promise<Response> {
  return withApiHandler(request, "/api/cron/news-ingest", async () => {
    assertCronAuthorized(request);
    const result = await getServerContainer().ingestion.ingest({
      queries: configuredQueries(),
      from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      to: new Date().toISOString(),
      limitPerProvider: 30,
    });
    return {
      data: {
        processed: result.providers.length,
        succeeded: result.providers.length - result.failed,
        failed: result.failed,
        skipped: 0,
        fetched: result.fetched,
        stored: result.stored,
      },
      dataMode:
        result.providers.length === 0 || result.failed > 0
          ? "degraded"
          : "live",
    };
  });
}
