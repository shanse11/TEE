import type { NewsArticle } from "@/types";
import type { NewsProvider, NewsSearchInput } from "@/types/backend";
import {
  clampNewsLimit,
  matchesNewsQuery,
  withinNewsTimeRange,
} from "@/lib/news/providers/query-filter";
import { newsQueryTerms } from "@/lib/news/providers/query-terms";
import { stableHash } from "@/lib/security/stable-id";

const MAX_BODY_BYTES = 500_000;
const MIN_CACHE_TTL_MS = 120_000;

export type PublicHomepageSource = {
  id: "xinhua" | "chinanews" | "gmw" | "stdaily";
  name: string;
  homepageUrl: string;
  allowedHosts: readonly string[];
};

export const PUBLIC_HOMEPAGE_SOURCES: readonly PublicHomepageSource[] = [
  {
    id: "xinhua",
    name: "新华网",
    homepageUrl: "https://www.news.cn/",
    allowedHosts: ["news.cn", "xinhuanet.com"],
  },
  {
    id: "chinanews",
    name: "中国新闻网",
    homepageUrl: "https://www.chinanews.com.cn/",
    allowedHosts: ["chinanews.com.cn"],
  },
  {
    id: "gmw",
    name: "光明网",
    homepageUrl: "https://www.gmw.cn/",
    allowedHosts: ["gmw.cn"],
  },
  {
    id: "stdaily",
    name: "科技日报",
    homepageUrl: "https://www.stdaily.com/",
    allowedHosts: ["stdaily.com"],
  },
];

type CachedHomepage = {
  expiresAt: number;
  articles: NewsArticle[];
};

export interface PublicHomepageNewsProviderOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  cacheTtlMs?: number;
  now?: () => number;
}

/**
 * 读取公开新闻首页的标题索引。每个网站都是独立 Provider，失败时不会影响
 * 其他来源；仅保留标题、官方链接和 URL 中明确给出的发布日期。
 */
export class PublicHomepageNewsProvider implements NewsProvider {
  readonly name: string;
  readonly dataMode = "live" as const;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private cache: CachedHomepage | null = null;
  private pending: Promise<NewsArticle[]> | null = null;

  constructor(
    private readonly source: PublicHomepageSource,
    options: PublicHomepageNewsProviderOptions = {},
  ) {
    this.name = `${source.id}-homepage`;
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
      const response = await this.fetcher(this.source.homepageUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "TodayPaper/1.0 (+public-news-index)",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `${this.source.id.toUpperCase()}_HTTP_${response.status}`,
        );
      }
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > MAX_BODY_BYTES) {
        throw new Error(`${this.source.id.toUpperCase()}_RESPONSE_TOO_LARGE`);
      }
      const html = await response.text();
      if (new TextEncoder().encode(html).byteLength > MAX_BODY_BYTES) {
        throw new Error(`${this.source.id.toUpperCase()}_RESPONSE_TOO_LARGE`);
      }
      return parseHomepage(html, this.source);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}

export function parseHomepage(
  html: string,
  source: PublicHomepageSource,
): NewsArticle[] {
  const articles = new Map<string, NewsArticle>();
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const href = readAttribute(match[1], "href");
    const sourceUrl = normalizeSourceUrl(href, source);
    if (!sourceUrl) continue;
    const publishedAt = publishedAtFromUrl(sourceUrl);
    if (!publishedAt) continue;
    const title =
      readAttribute(match[1], "title") ||
      decodeHtml(stripTags(match[2])).trim() ||
      readAttribute(match[2], "alt");
    if (title.length < 4 || title.length > 120) continue;
    articles.set(sourceUrl, {
      id: `${source.id}-${stableHash(sourceUrl)}`,
      title,
      description: title,
      source: source.name,
      sourceUrl,
      publishedAt,
      category: inferCategory(sourceUrl, source.id),
      keywords: [],
    });
  }
  return Array.from(articles.values());
}

function readAttribute(value: string, name: string): string {
  const pattern = new RegExp(
    `\\b${name}\\s*=\\s*(?:([\"'])(.*?)\\1|([^\\s>]+))`,
    "i",
  );
  const match = value.match(pattern);
  return decodeHtml(match?.[2] ?? match?.[3] ?? "").trim();
}

function normalizeSourceUrl(
  value: string,
  source: PublicHomepageSource,
): string | null {
  try {
    const url = new URL(value, source.homepageUrl);
    const hostname = url.hostname.toLocaleLowerCase("en-US");
    if (
      !source.allowedHosts.some(
        (host) => hostname === host || hostname.endsWith(`.${host}`),
      )
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
  const patterns = [
    /\/(\d{4})(\d{2})(\d{2})\//,
    /\/(\d{4})-(\d{2})\/(\d{2})\//,
    /\/(\d{4})\/(\d{2})-(\d{2})\//,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}T00:00:00+08:00`;
    }
  }
  return null;
}

function inferCategory(
  value: string,
  sourceId: PublicHomepageSource["id"],
): string {
  const url = new URL(value);
  const key = `${url.hostname}${url.pathname}`.toLocaleLowerCase("en-US");
  if (/(finance|fortune|economy|\/cj\/|\/money\/)/.test(key)) {
    return "商业财经";
  }
  if (/(health|\/jk\/|jiankang)/.test(key)) return "健康生活";
  if (/(sports|\/ty\/)/.test(key)) return "体育赛事";
  if (/(culture|\/ent\/|\/cul\/|wenhua)/.test(key)) return "电影娱乐";
  if (/(politics|\/gn\/|\/gj\/|theory)/.test(key)) return "政治时政";
  if (/(edu|science|tech|digital|it)/.test(key) || sourceId === "stdaily") {
    return "科技数码";
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
