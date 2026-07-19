import { assertCronAuthorized } from "@/lib/server/cron-auth";
import { getServerContainer } from "@/lib/server/container";
import { withApiHandler } from "@/lib/server/http";
import { shanghaiDate } from "@/lib/time/shanghai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  return withApiHandler(request, "/api/cron/daily-delivery", async () => {
    assertCronAuthorized(request);
    const container = getServerContainer();
    const due = await container.repository.listDueDeliveryUsers({
      deliveryTime: "08:00",
      limit: 20,
    });
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    for (const user of due) {
      try {
        const result = await container.delivery.deliver({
          userId: user.userId,
          issueDate: shanghaiDate(),
          retryFailed: true,
        });
        if (result.emailSent) succeeded += 1;
        else if (result.status === "partial") skipped += 1;
        else succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    return {
      data: {
        processed: due.length,
        succeeded,
        failed,
        skipped,
      },
      dataMode: failed > 0 ? "degraded" : "live",
    };
  });
}
