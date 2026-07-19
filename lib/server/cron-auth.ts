import { createHash, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/config/env";
import { BackendError } from "@/lib/errors";
import { ERROR_CODES } from "@/types/backend";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function isCronAuthorized(
  request: Request,
  expected = serverEnv.CRON_SECRET,
): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  return (
    Boolean(expected) &&
    Boolean(provided) &&
    timingSafeEqual(digest(expected ?? ""), digest(provided))
  );
}

export function assertCronAuthorized(request: Request): void {
  if (!isCronAuthorized(request)) {
    throw new BackendError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: "定时任务认证失败。",
      retryable: false,
    });
  }
}
