import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { NewsArticle } from "@/types";
import type { NewsProvider, NewsSearchInput } from "@/types/backend";
import {
  normalizeArticles,
  type RawArticle,
} from "@/lib/news/normalize";
import {
  matchesNewsQuery,
  withinNewsTimeRange,
} from "@/lib/news/providers/query-filter";
import type { RssSource } from "@/lib/news/providers/source-registry";

const MAX_BODY_BYTES = 1_000_000;

const rssItemSchema = z
  .object({
    title: z.union([z.string(), z.object({ "#text": z.string() })]).optional(),
    description: z
      .union([z.string(), z.object({ "#text": z.string() })])
      .optional(),
    summary: z.union([z.string(), z.object({ "#text": z.string() })]).optional(),
    link: z
      .union([
        z.string(),
        z.object({ href: z.string().optional(), "#text": z.string().optional() }),
      ])
      .optional(),
    guid: z.union([z.string(), z.object({ "#text": z.string() })]).optional(),
    pubDate: z.string().optional(),
    published: z.string().optional(),
    updated: z.string().optional(),
    enclosure: z.object({ url: z.string().optional() }).optional(),
  })
  .passthrough();

const feedSchema = z
  .object({
    rss: z.object({
      channel: z.object({
        item: z.union([rssItemSchema, z.array(rssItemSchema)]).optional(),
      }),
    }).optional(),
    feed: z
      .object({
        entry: z.union([rssItemSchema, z.array(rssItemSchema)]).optional(),
      })
      .optional(),
  })
  .passthrough();

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "#text" in value) {
    const candidate = (value as { "#text"?: unknown })["#text"];
    return typeof candidate === "string" ? candidate : undefined;
  }
  return undefined;
}

function link(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const candidate = value as { href?: unknown; "#text"?: unknown };
    if (typeof candidate.href === "string") return candidate.href;
    if (typeof candidate["#text"] === "string") return candidate["#text"];
  }
  return undefined;
}

export interface RssNewsProviderOptions {
  sources: RssSource[];
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export class RssNewsProvider implements NewsProvider {
  readonly name = "rss";
  readonly dataMode = "live" as const;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: RssNewsProviderOptions) {
    this.timeoutMs = Math.min(options.timeoutMs ?? 8000, 15_000);
    this.fetcher = options.fetcher ?? fetch;
  }

  async search(
    input: NewsSearchInput,
    signal?: AbortSignal,
  ): Promise<NewsArticle[]> {
    const settled = await Promise.allSettled(
      this.options.sources.slice(0, 20).map((source) =>
        this.fetchSource(source, input, signal),
      ),
    );
    if (
      this.options.sources.length > 0 &&
      settled.every((result) => result.status === "rejected")
    ) {
      throw new Error("RSS_PROVIDER_UNAVAILABLE");
    }
    return settled
      .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
      .filter(
        (article) =>
          matchesNewsQuery(article, input.query) &&
          withinNewsTimeRange(article, input.from, input.to),
      )
      .slice(0, input.limit ?? 50);
  }

  private async fetchSource(
    source: RssSource,
    input: NewsSearchInput,
    externalSignal?: AbortSignal,
  ): Promise<NewsArticle[]> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.fetchSourceOnce(source, input, externalSignal);
      } catch (error) {
        lastError = error;
        if (
          error instanceof RssHttpError &&
          error.status !== 429 &&
          error.status < 500
        ) {
          break;
        }
        if (error instanceof z.ZodError) break;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("RSS_PROVIDER_UNAVAILABLE");
  }

  private async fetchSourceOnce(
    source: RssSource,
    input: NewsSearchInput,
    externalSignal?: AbortSignal,
  ): Promise<NewsArticle[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    externalSignal?.addEventListener("abort", abort);
    try {
      const response = await this.fetcher(source.url, {
        headers: {
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
          "User-Agent": "TodayPaper/1.0",
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new RssHttpError(response.status);
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > MAX_BODY_BYTES) throw new Error("RSS_RESPONSE_TOO_LARGE");
      const body = await response.text();
      if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
        throw new Error("RSS_RESPONSE_TOO_LARGE");
      }
      const xml: unknown = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
        textNodeName: "#text",
      }).parse(body);
      const feed = feedSchema.parse(xml);
      const rawItems =
        feed.rss?.channel.item ?? feed.feed?.entry ?? [];
      const items = Array.isArray(rawItems) ? rawItems : [rawItems];
      return normalizeArticles(
        items.map(
          (item): RawArticle => ({
            id: text(item.guid),
            title: text(item.title),
            description: text(item.description) ?? text(item.summary),
            source: source.name,
            sourceUrl: link(item.link),
            publishedAt: item.pubDate ?? item.published ?? item.updated,
            category: source.category || input.query,
            imageUrl: item.enclosure?.url,
            keywords: [input.query, source.category],
          }),
        ),
      );
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abort);
    }
  }
}

class RssHttpError extends Error {
  constructor(readonly status: number) {
    super(`RSS_HTTP_${status}`);
  }
}
