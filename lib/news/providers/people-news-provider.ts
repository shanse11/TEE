import type { NewsArticle } from "@/types";
import type { NewsProvider, NewsSearchInput } from "@/types/backend";
import {
  clampNewsLimit,
  matchesNewsQuery,
  withinNewsTimeRange,
} from "@/lib/news/providers/query-filter";
import { newsQueryTerms } from "@/lib/news/providers/query-terms";
import { stableHash } from "@/lib/security/stable-id";

const PEOPLE_HOMEPAGE_URL = "https://www.people.cn/GB/";
const MAX_BODY_BYTES = 500_000;
const MIN_CACHE_TTL_MS = 120_000;

type CachedHomepage = {
  expiresAt: number;
  articles: NewsArticle[];
};

export interface PeopleNewsProviderOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  cacheTtlMs?: number;
  now?: () => number;
}

/**
 * 人民网公开首页 Provider。
 *
 * 人民网官方 RSS 仍可访问，但当前频道 Feed 的内容日期已经明显滞后；
 * 因此实时搜索读取 robots.txt 允许抓取的公开首页，并按其 Crawl-delay
 * 至少缓存 120 秒。这里只保存标题、链接和日期，不抓取文章正文。
 */
export class PeopleNewsProvider implements NewsProvider {
  readonly name = "people-homepage";
  readonly dataMode = "live" as const;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private cache: CachedHomepage | null = null;
  private pending: Promise<NewsArticle[]> | null = null;

  constructor(options: PeopleNewsProviderOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = Math.min(options.timeoutMs ?? 8000, 15_000);
    this.cacheTtlMs = Math.max(
      options.cacheTtlMs ?? MIN_CACHE_TTL_MS,
      MIN_CACHE_TTL_MS,
    );
    this.now = options.now ?? Date.now;
  }

  async search(
    input: NewsSearchInput,
    signal?: AbortSignal,
  ): Promise<NewsArticle[]> {
    const articles = await this.loadHomepage(signal);
    const terms = newsQueryTerms(input.query);
    return articles
      .filter(
        (article) =>
          terms.some((term) => matchesNewsQuery(article, term)) &&
          withinNewsTimeRange(article, input.from, input.to),
      )
      .slice(0, clampNewsLimit(input.limit));
  }

  private async loadHomepage(signal?: AbortSignal): Promise<NewsArticle[]> {
    const now = this.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.articles;
    }
    if (this.pending) {
      return this.pending;
    }

    this.pending = this.fetchHomepage(signal);
    try {
      const articles = await this.pending;
      this.cache = {
        articles,
        expiresAt: this.now() + this.cacheTtlMs,
      };
      return articles;
    } finally {
      this.pending = null;
    }
  }

  private async fetchHomepage(signal?: AbortSignal): Promise<NewsArticle[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort);
    try {
      const response = await this.fetcher(PEOPLE_HOMEPAGE_URL, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "TodayPaper/1.0 (+public-news-index)",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`PEOPLE_HTTP_${response.status}`);
      }
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > MAX_BODY_BYTES) {
        throw new Error("PEOPLE_RESPONSE_TOO_LARGE");
      }
      const html = await response.text();
      if (new TextEncoder().encode(html).byteLength > MAX_BODY_BYTES) {
        throw new Error("PEOPLE_RESPONSE_TOO_LARGE");
      }
      return parsePeopleHomepage(html);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}

function parsePeopleHomepage(html: string): NewsArticle[] {
  const articles = new Map<string, NewsArticle>();
  const anchorPattern =
    /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const sourceUrl = normalizePeopleUrl(match[2]);
    if (!sourceUrl) continue;
    const publishedAt = publishedAtFromUrl(sourceUrl);
    if (!publishedAt) continue;
    const title = decodeHtml(stripTags(match[3])).trim();
    if (title.length < 4 || title.length > 120) continue;
    const article: NewsArticle = {
      id: `people-${stableHash(sourceUrl)}`,
      title,
      description: title,
      source: "人民网",
      sourceUrl,
      publishedAt,
      category: inferCategory(sourceUrl),
      keywords: [],
    };
    articles.set(sourceUrl, article);
  }
  return Array.from(articles.values());
}

function normalizePeopleUrl(value: string): string | null {
  try {
    const url = new URL(value, PEOPLE_HOMEPAGE_URL);
    const hostname = url.hostname.toLocaleLowerCase("en-US");
    if (
      hostname !== "people.cn" &&
      !hostname.endsWith(".people.cn") &&
      hostname !== "people.com.cn" &&
      !hostname.endsWith(".people.com.cn")
    ) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function publishedAtFromUrl(value: string): string | null {
  const match = value.match(/\/n[12]\/(\d{4})\/(\d{2})(\d{2})\//);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}T00:00:00+08:00`;
}

function inferCategory(value: string): string {
  const hostname = new URL(value).hostname;
  if (hostname.startsWith("finance.")) return "商业财经";
  if (hostname.startsWith("health.")) return "健康生活";
  if (hostname.startsWith("sports.") || hostname.startsWith("ent.")) {
    return "体育文娱";
  }
  if (hostname.startsWith("edu.") || hostname.startsWith("kpzg.")) {
    return "教育科研";
  }
  if (hostname.startsWith("politics.") || hostname.startsWith("cpc.")) {
    return "政治时政";
  }
  return "综合";
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/\s+/g, " ");
}
