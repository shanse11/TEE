import { z } from "zod";
import type { NewsArticle } from "@/types";
import type { NewsProvider, NewsSearchInput } from "@/types/backend";
import { hasNewsApiKey, serverEnv } from "@/lib/config/env";
import {
  normalizeArticles,
  type RawArticle,
} from "@/lib/news/normalize";

/**
 * 通用新闻 API Provider（NewsAPI.org 风格）。
 * - 仅在服务端实例化；NEWS_API_KEY 缺失时不影响应用启动。
 * - 外部返回先 zod 校验再规范化。
 * - 超时、429、5xx 最多重试 1 次；4xx 参数错误不重试。
 * - 限制响应体大小；错误日志不打印密钥与完整原文。
 *
 * 无密钥环境下不会发起真实请求；测试默认使用 DemoNewsProvider。
 */

const DEFAULT_BASE_URL = "https://newsapi.org/v2/everything";
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 1_000_000;

const externalArticleSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  url: z.string().optional(),
  urlToImage: z.string().optional(),
  publishedAt: z.string().optional(),
  source: z
    .object({
      name: z.string().optional(),
    })
    .optional(),
});

const externalResponseSchema = z.object({
  articles: z.array(externalArticleSchema).default([]),
});

export interface GenericNewsApiProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  domains?: string[];
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export class GenericNewsApiProvider implements NewsProvider {
  readonly name = "newsapi";
  readonly dataMode = "live" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly domains: string[];
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: GenericNewsApiProviderOptions = {}) {
    this.apiKey = options.apiKey ?? serverEnv.NEWS_API_KEY ?? "";
    this.baseUrl =
      options.baseUrl ?? serverEnv.NEWS_API_BASE_URL ?? DEFAULT_BASE_URL;
    this.domains =
      options.domains ??
      (serverEnv.NEWS_API_DOMAINS ?? "")
        .split(",")
        .map((domain) => domain.trim().toLocaleLowerCase("en-US"))
        .filter(
          (domain) =>
            domain.length > 0 &&
            /^[a-z0-9.-]+$/.test(domain) &&
            !domain.startsWith(".") &&
            !domain.endsWith("."),
        )
        .slice(0, 20);
    this.timeoutMs = Math.min(
      options.timeoutMs ??
        serverEnv.NEWS_PROVIDER_TIMEOUT_MS ??
        DEFAULT_TIMEOUT_MS,
      15_000,
    );
    this.fetcher = options.fetcher ?? fetch;
  }

  async search(
    input: NewsSearchInput,
    signal?: AbortSignal,
  ): Promise<NewsArticle[]> {
    if (this.apiKey.length === 0) {
      throw new Error("NEWS_API_KEY 未配置，GenericNewsApiProvider 不可用");
    }

    return this.fetchWithRetry(input, signal);
  }

  private async fetchWithRetry(
    input: NewsSearchInput,
    signal?: AbortSignal,
  ): Promise<NewsArticle[]> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.fetchOnce(input, signal);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (
          error instanceof ProviderHttpError &&
          !isRetryableStatus(error.status)
        ) {
          break;
        }
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          break;
        }
      }
    }
    throw lastError ?? new Error("新闻源请求失败");
  }

  private async fetchOnce(
    input: NewsSearchInput,
    externalSignal?: AbortSignal,
  ): Promise<NewsArticle[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener("abort", onExternalAbort);

    try {
      const url = new URL(this.baseUrl);
      url.searchParams.set("q", input.query);
      url.searchParams.set("language", input.language ?? "zh");
      url.searchParams.set("sortBy", "publishedAt");
      if (input.from) url.searchParams.set("from", input.from.slice(0, 10));
      if (input.to) url.searchParams.set("to", input.to.slice(0, 10));
      if (input.limit) url.searchParams.set("pageSize", String(input.limit));
      if (this.domains.length > 0) {
        url.searchParams.set("domains", this.domains.join(","));
      }

      const response = await this.fetcher(url.toString(), {
        method: "GET",
        headers: { "X-Api-Key": this.apiKey },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ProviderHttpError(response.status, `HTTP ${response.status}`);
      }

      const text = await readLimitedText(response, MAX_BODY_BYTES);
      const json = JSON.parse(text) as unknown;
      const parsed = externalResponseSchema.parse(json);

      return normalizeArticles(
        parsed.articles.map((article) => ({
          title: article.title,
          description: article.description,
          content: article.content,
          source: article.source?.name,
          sourceUrl: article.url,
          publishedAt: article.publishedAt,
          category: input.query,
          imageUrl: article.urlToImage,
          keywords: [input.query],
        })) satisfies RawArticle[],
      );
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }
  }
}

export class ProviderHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

async function readLimitedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return response.text();
  }
  const decoder = new TextDecoder();
  let received = 0;
  let output = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    received += value.byteLength;
    if (received > maxBytes) {
      reader.cancel();
      break;
    }
    output += decoder.decode(value, { stream: true });
  }
  return output;
}

/** 是否启用真实新闻源。仅判断存在性，不暴露值。 */
export function isGenericNewsProviderEnabled(): boolean {
  return hasNewsApiKey();
}
