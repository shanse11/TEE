import { creationFiltersSchema } from "@/lib/api/schemas";
import { getServerContainer } from "@/lib/server/container";
import {
  parseValue,
  resolveUserId,
  withApiHandler,
} from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApiHandler(request, "/api/creations", async () => {
    const url = new URL(request.url);
    const filters = parseValue(creationFiltersSchema, {
      type: url.searchParams.get("type") ?? undefined,
      keyword:
        url.searchParams.get("keyword") ??
        url.searchParams.get("query") ??
        undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      offset: Number(url.searchParams.get("offset") ?? "0"),
      limit: Number(url.searchParams.get("limit") ?? "12"),
    });
    const container = getServerContainer();
    const userId = await resolveUserId(request);
    const result = await container.repository.listCreations(userId, filters);
    return {
      data: {
        items: result.items,
        total: result.total,
        offset: filters.offset,
        limit: filters.limit,
      },
      dataMode: container.repository.mode === "memory" ? "demo" : "live",
    };
  });
}
