import { updateSubscriptionRequestSchema } from "@/lib/api/schemas";
import { getServerContainer } from "@/lib/server/container";
import {
  parseJsonBody,
  resolveUserId,
  withApiHandler,
} from "@/lib/server/http";
import { enforceWriteRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return withApiHandler(request, "/api/subscriptions/:id", async () => {
    const container = getServerContainer();
    await enforceWriteRateLimit(
      request,
      "/api/subscriptions/:id",
      container.rateLimit,
    );
    const { id } = await context.params;
    const input = await parseJsonBody(
      request,
      updateSubscriptionRequestSchema,
    );
    const userId = await resolveUserId(request);
    const data = await container.subscriptions.update(userId, id, input);
    return {
      data,
      dataMode: container.repository.mode === "memory" ? "demo" : "live",
      meta: { persisted: container.repository.persistent },
    };
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return withApiHandler(request, "/api/subscriptions/:id", async () => {
    const container = getServerContainer();
    await enforceWriteRateLimit(
      request,
      "/api/subscriptions/:id",
      container.rateLimit,
    );
    const { id } = await context.params;
    const userId = await resolveUserId(request);
    await container.subscriptions.delete(userId, id);
    return {
      data: { deleted: true, id },
      dataMode: container.repository.mode === "memory" ? "demo" : "live",
      meta: { persisted: container.repository.persistent },
    };
  });
}
