import { paginationQuerySchema } from "@/lib/api/schemas";
import { getServerContainer } from "@/lib/server/container";
import {
  parseValue,
  resolveUserId,
  withApiHandler,
} from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApiHandler(request, "/api/daily-issues", async () => {
    const url = new URL(request.url);
    const pagination = parseValue(paginationQuerySchema, {
      page: url.searchParams.get("page") ?? "1",
      limit: url.searchParams.get("limit") ?? "20",
    });
    const container = getServerContainer();
    const userId = await resolveUserId(request);
    const result = await container.repository.listDailyIssues(
      userId,
      pagination.page,
      pagination.limit,
    );
    return {
      data: result.items,
      dataMode: container.repository.mode === "memory" ? "demo" : "live",
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total: result.total,
      },
    };
  });
}
