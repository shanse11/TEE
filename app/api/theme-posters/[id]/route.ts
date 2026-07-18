import { BackendError } from "@/lib/errors";
import { ERROR_CODES } from "@/types/backend";
import { getServerContainer } from "@/lib/server/container";
import { resolveUserId, withApiHandler } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return withApiHandler(request, "/api/theme-posters/:id", async () => {
    const { id } = await context.params;
    const container = getServerContainer();
    const userId = await resolveUserId(request);
    const data = await container.repository.findThemePoster(id, userId);
    if (!data) {
      throw new BackendError({
        code: ERROR_CODES.NOT_FOUND,
        message: "主题海报不存在。",
        retryable: false,
      });
    }
    return {
      data,
      dataMode: container.repository.mode === "memory" ? "demo" : "live",
    };
  });
}
