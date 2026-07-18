import { z } from "zod";
import type { LLMClient, LLMGenerateInput } from "@/types/backend";
import { BackendError } from "@/lib/errors";
import { ERROR_CODES } from "@/types/backend";
import { isHttpUrl } from "@/lib/security/url";

const MAX_RESPONSE_BYTES = 1_000_000;

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable(),
        }),
      }),
    )
    .min(1),
});

export interface OpenAICompatibleLLMClientOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

class LLMRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "LLMRequestError";
  }
}

function endpointFor(baseUrl: string): URL {
  if (!isHttpUrl(baseUrl)) {
    throw new Error("LLM_BASE_URL 必须是合法的 http/https URL");
  }
  const base = new URL(baseUrl);
  const isLocal =
    base.hostname === "localhost" || base.hostname === "127.0.0.1";
  if (base.protocol !== "https:" && !isLocal) {
    throw new Error("LLM_BASE_URL 仅允许 HTTPS，开发机 localhost 除外");
  }
  const pathname = base.pathname.replace(/\/$/, "");
  base.pathname = pathname.endsWith("/v1")
    ? `${pathname}/chat/completions`
    : `${pathname}/chat/completions`;
  return base;
}

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const firstObject = trimmed.indexOf("{");
    const lastObject = trimmed.lastIndexOf("}");
    if (firstObject >= 0 && lastObject > firstObject) {
      return JSON.parse(trimmed.slice(firstObject, lastObject + 1)) as unknown;
    }
    throw new Error("模型未返回可解析的 JSON");
  }
}

async function readLimitedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    throw new LLMRequestError("模型响应体过大", false);
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new LLMRequestError("模型响应体过大", false);
  }
  return text;
}

export class OpenAICompatibleLLMClient implements LLMClient {
  readonly mode = "live" as const;
  private readonly endpoint: URL;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: OpenAICompatibleLLMClientOptions) {
    if (!options.apiKey) {
      throw new Error("LLM_API_KEY 未配置");
    }
    if (!options.model) {
      throw new Error("LLM_MODEL 未配置");
    }
    this.endpoint = endpointFor(options.baseUrl);
    this.timeoutMs = Math.min(Math.max(options.timeoutMs ?? 12000, 1000), 30000);
    this.fetcher = options.fetcher ?? fetch;
  }

  async generateStructured<T>(input: LLMGenerateInput<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.requestOnce(input, attempt === 1);
      } catch (error) {
        lastError = error;
        if (error instanceof LLMRequestError && !error.retryable) {
          break;
        }
      }
    }

    if (lastError instanceof BackendError) {
      throw lastError;
    }
    throw new BackendError({
      code:
        lastError instanceof LLMRequestError
          ? ERROR_CODES.AI_UNAVAILABLE
          : ERROR_CODES.AI_INVALID_OUTPUT,
      message: "AI 结构化生成暂时不可用。",
      retryable: true,
    });
  }

  private async requestOnce<T>(
    input: LLMGenerateInput<T>,
    repair: boolean,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    input.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const isDeepSeek = this.endpoint.hostname.endsWith("deepseek.com");
      const jsonSchema = JSON.stringify(z.toJSONSchema(input.schema));
      const structuredSystemPrompt = [
        input.systemPrompt,
        "输出必须严格符合以下 JSON Schema，不得增加 Schema 之外的字段：",
        jsonSchema,
        ...(repair
          ? ["上一次输出未通过校验，请只返回完整、合法的 JSON。"]
          : []),
      ].join("\n");
      const body: Record<string, unknown> = {
        model: this.options.model,
        messages: [
          {
            role: "system",
            content: structuredSystemPrompt,
          },
          { role: "user", content: input.userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
        temperature: input.temperature ?? 0.2,
      };
      if (isDeepSeek) {
        body.thinking = { type: "disabled" };
      }

      let response: Response;
      try {
        response = await this.fetcher(this.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        throw new LLMRequestError(
          error instanceof Error && error.name === "AbortError"
            ? "模型请求超时"
            : "模型请求失败",
          true,
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new LLMRequestError("模型认证失败", false);
      }
      if (!response.ok) {
        throw new LLMRequestError(
          `模型服务返回 HTTP ${response.status}`,
          response.status === 429 || response.status >= 500,
        );
      }

      const raw = await readLimitedText(response, MAX_RESPONSE_BYTES);
      const parsedResponse = responseSchema.parse(JSON.parse(raw) as unknown);
      const content = parsedResponse.choices[0].message.content;
      if (!content) {
        throw new BackendError({
          code: ERROR_CODES.AI_INVALID_OUTPUT,
          message: "AI 返回了空内容。",
          retryable: true,
        });
      }
      const parsedJson = extractJson(content);
      const parsed = input.schema.safeParse(parsedJson);
      if (!parsed.success) {
        throw new BackendError({
          code: ERROR_CODES.AI_INVALID_OUTPUT,
          message: "AI 输出未通过结构校验。",
          retryable: true,
        });
      }
      return parsed.data;
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", onAbort);
    }
  }
}
