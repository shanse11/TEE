import { BackendError } from "@/lib/errors";
import { ERROR_CODES } from "@/types/backend";

export interface RateLimitAdapter {
  consume(key: string, limit: number, windowMs: number): Promise<boolean>;
}

type Counter = { count: number; resetAt: number };

export class MemoryRateLimitAdapter implements RateLimitAdapter {
  private readonly counters = new Map<string, Counter>();

  async consume(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const current = this.counters.get(key);
    if (!current || current.resetAt <= now) {
      this.counters.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= limit) {
      return false;
    }
    current.count += 1;
    return true;
  }
}

export async function enforceWriteRateLimit(
  request: Request,
  route: string,
  adapter: RateLimitAdapter,
): Promise<void> {
  const key = `${route}:${request.headers.get("x-forwarded-for") ?? "local"}`;
  if (!(await adapter.consume(key, 30, 60_000))) {
    throw new BackendError({
      code: ERROR_CODES.RATE_LIMITED,
      message: "请求过于频繁，请稍后重试。",
      retryable: true,
    });
  }
}
