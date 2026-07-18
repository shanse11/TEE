import { z } from "zod";
import {
  createSubscriptionRequestSchema,
  saveSubscriptionsInputSchema,
} from "@/lib/api/schemas";
import { getServerContainer } from "@/lib/server/container";
import {
  parseJsonBody,
  resolveUserId,
  withApiHandler,
} from "@/lib/server/http";
import { enforceWriteRateLimit } from "@/lib/server/rate-limit";
import type { Subscription, SubscriptionBundle } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.union([
  saveSubscriptionsInputSchema,
  createSubscriptionRequestSchema,
]);

export async function GET(request: Request): Promise<Response> {
  return withApiHandler(request, "/api/subscriptions", async () => {
    const container = getServerContainer();
    const userId = await resolveUserId(request);
    const data = await container.subscriptions.getBundle(userId);
    return {
      data,
      dataMode: container.repository.mode === "memory" ? "demo" : "live",
      meta: { persisted: container.repository.persistent },
    };
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApiHandler<SubscriptionBundle | Subscription>(
    request,
    "/api/subscriptions",
    async () => {
    const container = getServerContainer();
    await enforceWriteRateLimit(
      request,
      "/api/subscriptions",
      container.rateLimit,
    );
    const input = await parseJsonBody(request, postSchema);
    const userId = await resolveUserId(request);
    if ("subscriptions" in input) {
      const data = await container.subscriptions.replaceBundle(userId, input);
      return {
        data,
        dataMode: container.repository.mode === "memory" ? "demo" : "live",
        meta: { persisted: container.repository.persistent },
      };
    }
    const data = await container.subscriptions.create(userId, input);
    return {
      data,
      status: 201,
      dataMode: container.repository.mode === "memory" ? "demo" : "live",
      meta: { persisted: container.repository.persistent },
    };
    },
  );
}
