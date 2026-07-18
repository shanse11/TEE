import { dailyIssueGenerateRequestSchema } from "@/lib/api/schemas";
import { getServerContainer } from "@/lib/server/container";
import {
  parseJsonBody,
  resolveUserId,
  withApiHandler,
} from "@/lib/server/http";
import { enforceWriteRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withApiHandler(request, "/api/daily-issue/generate", async () => {
    const container = getServerContainer();
    await enforceWriteRateLimit(
      request,
      "/api/daily-issue/generate",
      container.rateLimit,
    );
    const input = await parseJsonBody(
      request,
      dailyIssueGenerateRequestSchema,
    );
    const userId = await resolveUserId(request, input.userId);
    const result = await container.dailyIssue.generate({
      ...input,
      userId,
    });
    return {
      data: result.data,
      dataMode: result.dataMode,
      meta: {
        status: result.status,
        persisted: result.persisted,
        aiMode: result.aiMode,
        degraded: result.degraded,
      },
    };
  });
}
