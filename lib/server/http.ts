import { z } from "zod";
import type { DataMode } from "@/types/backend";
import { ERROR_CODES } from "@/types/backend";
import { BackendError } from "@/lib/errors";
import { redactLog } from "@/lib/security/redact";
import { requireCurrentUser } from "@/lib/auth/current-user";

const MAX_BODY_BYTES = 64 * 1024;

export type ApiHandlerResult<T> = {
  data: T;
  dataMode?: DataMode;
  status?: number;
  meta?: Record<string, unknown>;
};

function statusForError(code: string): number {
  switch (code) {
    case ERROR_CODES.INVALID_INPUT:
      return 400;
    case ERROR_CODES.UNAUTHORIZED:
      return 401;
    case ERROR_CODES.NOT_FOUND:
      return 404;
    case ERROR_CODES.CONFLICT:
    case ERROR_CODES.DAILY_ISSUE_EXISTS:
    case ERROR_CODES.GENERATION_IN_PROGRESS:
      return 409;
    case ERROR_CODES.RATE_LIMITED:
      return 429;
    case ERROR_CODES.NEWS_PROVIDER_UNAVAILABLE:
    case ERROR_CODES.AI_UNAVAILABLE:
    case ERROR_CODES.DATABASE_UNAVAILABLE:
      return 503;
    default:
      return 500;
  }
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLocaleLowerCase().includes("application/json")) {
    throw new BackendError({
      code: ERROR_CODES.INVALID_INPUT,
      message: "请求 Content-Type 必须为 application/json。",
      retryable: false,
    });
  }
  const declaredSize = Number(request.headers.get("content-length") ?? "0");
  if (declaredSize > MAX_BODY_BYTES) {
    throw new BackendError({
      code: ERROR_CODES.INVALID_INPUT,
      message: "请求体过大。",
      retryable: false,
    });
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new BackendError({
      code: ERROR_CODES.INVALID_INPUT,
      message: "请求体过大。",
      retryable: false,
    });
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new BackendError({
      code: ERROR_CODES.INVALID_INPUT,
      message: "请求体不是有效 JSON。",
      retryable: false,
    });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new BackendError({
      code: ERROR_CODES.INVALID_INPUT,
      message: parsed.error.issues[0]?.message ?? "请求参数无效。",
      retryable: false,
    });
  }
  return parsed.data;
}

export function parseValue<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BackendError({
      code: ERROR_CODES.INVALID_INPUT,
      message: parsed.error.issues[0]?.message ?? "请求参数无效。",
      retryable: false,
    });
  }
  return parsed.data;
}

export async function resolveUserId(
  _request: Request,
  _untrustedRequestedId?: string,
): Promise<string> {
  void _request;
  void _untrustedRequestedId;
  const user = await requireCurrentUser();
  return user.id;
}

function logRequest(value: Record<string, unknown>): void {
  console.info(redactLog(JSON.stringify(value)));
}

export async function withApiHandler<T>(
  request: Request,
  route: string,
  handler: (requestId: string) => Promise<ApiHandlerResult<T>>,
): Promise<Response> {
  const requestId = newRequestId();
  const startedAt = Date.now();
  try {
    const result = await handler(requestId);
    const generatedAt = new Date().toISOString();
    logRequest({
      level: "info",
      requestId,
      route,
      method: request.method,
      durationMs: Date.now() - startedAt,
      dataMode: result.dataMode ?? "demo",
      code: "OK",
    });
    return Response.json(
      {
        data: result.data,
        meta: {
          requestId,
          dataMode: result.dataMode ?? "demo",
          generatedAt,
          ...result.meta,
        },
      },
      {
        status: result.status ?? 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const backendError =
      error instanceof BackendError
        ? error
        : new BackendError({
            code: ERROR_CODES.INTERNAL_ERROR,
            message: "服务暂时不可用，请稍后重试。",
            retryable: true,
          });
    logRequest({
      level: "error",
      requestId,
      route,
      method: request.method,
      durationMs: Date.now() - startedAt,
      code: backendError.code,
    });
    return Response.json(
      {
        error: backendError.toApiError(requestId),
      },
      {
        status: statusForError(backendError.code),
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
