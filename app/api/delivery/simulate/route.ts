import { simulateDailyDeliveryInputSchema } from "@/lib/api/schemas";
import { getServerContainer } from "@/lib/server/container";
import {
  parseJsonBody,
  resolveUserId,
  withApiHandler,
} from "@/lib/server/http";
import { enforceWriteRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withApiHandler(request, "/api/delivery/simulate", async () => {
    const container = getServerContainer();
    await enforceWriteRateLimit(
      request,
      "/api/delivery/simulate",
      container.rateLimit,
    );
    const input = await parseJsonBody(
      request,
      simulateDailyDeliveryInputSchema,
    );
    const userId = await resolveUserId(request, input.userId);
    const shouldSend = container.emailSender.mode === "resend";
    const data = shouldSend
      ? await container.delivery.deliver({
          userId,
          issueDate: input.issueDate,
          retryFailed: true,
        })
      : await container.delivery.simulate({
          userId,
          issueDate: input.issueDate,
        });
    return {
      data,
      dataMode: container.repository.mode === "memory" ? "demo" : "live",
      meta: {
        persisted: container.repository.persistent,
        delivery: shouldSend ? "email" : "simulated",
      },
    };
  });
}
