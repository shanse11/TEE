import { saveCreationInputSchema } from "@/lib/api/schemas";
import { BackendError } from "@/lib/errors";
import { ERROR_CODES } from "@/types/backend";
import { getServerContainer } from "@/lib/server/container";
import {
  parseJsonBody,
  resolveUserId,
  withApiHandler,
} from "@/lib/server/http";
import { enforceWriteRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withApiHandler(request, "/api/creations/save", async () => {
    const container = getServerContainer();
    await enforceWriteRateLimit(
      request,
      "/api/creations/save",
      container.rateLimit,
    );
    const input = await parseJsonBody(request, saveCreationInputSchema);
    const userId = await resolveUserId(request);
    const data = await container.repository.saveCreationByHref(
      userId,
      input.href,
    );
    if (!data) {
      throw new BackendError({
        code: ERROR_CODES.NOT_FOUND,
        message: "作品不存在。",
        retryable: false,
      });
    }
    return {
      data,
      dataMode: container.repository.mode === "memory" ? "demo" : "live",
      meta: { persisted: container.repository.persistent },
    };
  });
}
