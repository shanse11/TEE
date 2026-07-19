import { z } from "zod";
import type { NewsArticle } from "@/types";
import type { NewsProvider, NewsSearchInput } from "@/types/backend";
import {
  normalizeArticles,
  type RawArticle,
} from "@/lib/news/normalize";
import {
  clampNewsLimit,
  matchesNewsQuery,
  withinNewsTimeRange,
} from "@/lib/news/providers/query-filter";
import legacyPeopleTech from "@/data/raw/news-people-tech-2026-07-18.json";
import peopleAi from "@/data/raw/news-people-人工智能-2026-07-18.json";
import peopleSports from "@/data/raw/news-people-体育赛事-2026-07-18.json";
import peopleHealth from "@/data/raw/news-people-健康生活-2026-07-18.json";
import peopleBusiness from "@/data/raw/news-people-商业财经-2026-07-18.json";
import peopleAcademic from "@/data/raw/news-people-学术科研-2026-07-18.json";
import peoplePolitics from "@/data/raw/news-people-政治时政-2026-07-18.json";
import peopleEntertainment from "@/data/raw/news-people-电影娱乐-2026-07-18.json";
import peopleDigital from "@/data/raw/news-people-科技数码-2026-07-18.json";
import sampleBbcTechnology from "@/data/raw/sample-news-bbc-technology-2026-07-18.json";

const rawArticleSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    content: z.string().optional(),
    source: z.string().min(1),
    sourceUrl: z.string().optional(),
    publishedAt: z.string().min(1),
    category: z.string().min(1),
    imageUrl: z.string().optional(),
    keywords: z.array(z.string()).default([]),
  })
  .passthrough();

const datasetBatchSchema = z
  .object({
    schemaVersion: z.string().min(1),
    crawl: z
      .object({
        keyword: z.string().optional(),
        category: z.string().optional(),
      })
      .passthrough(),
    articles: z.array(rawArticleSchema),
  })
  .passthrough();

type DatasetCatalogEntry = {
  filename: string;
  aliases: string[];
  data: unknown;
};

const DATASET_CATALOG: DatasetCatalogEntry[] = [
  {
    filename: "news-people-tech-2026-07-18.json",
    aliases: ["人工智能", "科技数码"],
    data: legacyPeopleTech,
  },
  {
    filename: "news-people-人工智能-2026-07-18.json",
    aliases: ["人工智能"],
    data: peopleAi,
  },
  {
    filename: "news-people-体育赛事-2026-07-18.json",
    aliases: ["体育赛事", "体育"],
    data: peopleSports,
  },
  {
    filename: "news-people-健康生活-2026-07-18.json",
    aliases: ["健康生活", "健康"],
    data: peopleHealth,
  },
  {
    filename: "news-people-商业财经-2026-07-18.json",
    aliases: ["商业财经", "商业"],
    data: peopleBusiness,
  },
  {
    filename: "news-people-学术科研-2026-07-18.json",
    aliases: ["学术科研", "校园生活", "教育"],
    data: peopleAcademic,
  },
  {
    filename: "news-people-政治时政-2026-07-18.json",
    aliases: ["政治时政", "时政"],
    data: peoplePolitics,
  },
  {
    filename: "news-people-电影娱乐-2026-07-18.json",
    aliases: ["电影娱乐", "娱乐"],
    data: peopleEntertainment,
  },
  {
    filename: "news-people-科技数码-2026-07-18.json",
    aliases: ["科技数码", "科技"],
    data: peopleDigital,
  },
  {
    filename: "sample-news-bbc-technology-2026-07-18.json",
    aliases: ["人工智能", "科技数码"],
    data: sampleBbcTechnology,
  },
];

export interface LocalDatasetStats {
  fileCount: number;
  invalidFileCount: number;
  rawArticleCount: number;
  normalizedArticleCount: number;
  uniqueArticleCount: number;
  duplicateUrlGroups: number;
  duplicateRecordsMerged: number;
}

type DatasetSnapshot = {
  articles: NewsArticle[];
  stats: LocalDatasetStats;
};

function normalizedUrlKey(url: string | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return `${parsed.protocol}//${parsed.host.toLocaleLowerCase("en-US")}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return url.trim() || null;
  }
}

function mergeKeywords(...groups: ReadonlyArray<ReadonlyArray<string>>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const keyword of groups.flat()) {
    const value = keyword.trim();
    const key = value.toLocaleLowerCase("zh-CN");
    if (!value || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(value);
  }
  return merged;
}

function mergeDuplicate(
  existing: NewsArticle,
  candidate: NewsArticle,
): NewsArticle {
  return {
    ...existing,
    description:
      candidate.description.length > existing.description.length
        ? candidate.description
        : existing.description,
    content:
      (candidate.content?.length ?? 0) > (existing.content?.length ?? 0)
        ? candidate.content
        : existing.content,
    imageUrl: existing.imageUrl ?? candidate.imageUrl,
    keywords: mergeKeywords(
      existing.keywords,
      [existing.category],
      candidate.keywords,
      [candidate.category],
    ),
  };
}

function buildDatasetSnapshot(): DatasetSnapshot {
  const normalized: NewsArticle[] = [];
  let rawArticleCount = 0;
  let invalidFileCount = 0;

  for (const entry of DATASET_CATALOG) {
    const parsed = datasetBatchSchema.safeParse(entry.data);
    if (!parsed.success) {
      invalidFileCount += 1;
      continue;
    }
    rawArticleCount += parsed.data.articles.length;
    const batchKeywords = [
      ...entry.aliases,
      parsed.data.crawl.keyword,
      parsed.data.crawl.category,
    ].filter((value): value is string => Boolean(value));
    const enriched = parsed.data.articles.map((article) => ({
      ...article,
      description:
        article.description.trim() ||
        article.content?.slice(0, 1000) ||
        article.title,
      keywords: mergeKeywords(article.keywords, batchKeywords),
    })) satisfies RawArticle[];
    normalized.push(...normalizeArticles(enriched));
  }

  const articles: NewsArticle[] = [];
  const indexById = new Map<string, number>();
  const indexByUrl = new Map<string, number>();
  const duplicateUrlKeys = new Set<string>();
  let duplicateRecordsMerged = 0;

  for (const article of normalized) {
    const idIndex = indexById.get(article.id);
    const urlKey = normalizedUrlKey(article.sourceUrl);
    const urlIndex = urlKey ? indexByUrl.get(urlKey) : undefined;
    const existingIndex = idIndex ?? urlIndex;

    if (existingIndex !== undefined) {
      articles[existingIndex] = mergeDuplicate(
        articles[existingIndex],
        article,
      );
      indexById.set(article.id, existingIndex);
      if (urlKey) {
        indexByUrl.set(urlKey, existingIndex);
      }
      duplicateRecordsMerged += 1;
      if (urlKey && urlIndex !== undefined) {
        duplicateUrlKeys.add(urlKey);
      }
      continue;
    }

    const index = articles.length;
    articles.push(article);
    indexById.set(article.id, index);
    if (urlKey) {
      indexByUrl.set(urlKey, index);
    }
  }

  return {
    articles,
    stats: {
      fileCount: DATASET_CATALOG.length,
      invalidFileCount,
      rawArticleCount,
      normalizedArticleCount: normalized.length,
      uniqueArticleCount: articles.length,
      duplicateUrlGroups: duplicateUrlKeys.size,
      duplicateRecordsMerged,
    },
  };
}

const snapshot = buildDatasetSnapshot();

/**
 * 打包在应用中的 data/raw 新闻源。数据无需联网读取，按静态缓存来源上报。
 * 原始 ID 保留；相同 URL 的跨分类记录合并关键词和更完整的正文。
 */
export class LocalDatasetNewsProvider implements NewsProvider {
  readonly name = "local-dataset";
  readonly dataMode = "cache" as const;

  async search(input: NewsSearchInput): Promise<NewsArticle[]> {
    const limit = clampNewsLimit(input.limit);
    return snapshot.articles
      .filter(
        (article) =>
          matchesNewsQuery(article, input.query) &&
          withinNewsTimeRange(article, input.from, input.to),
      )
      .sort(
        (left, right) =>
          Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
      )
      .slice(0, limit)
      .map((article) => structuredClone(article));
  }
}

export function getLocalDatasetArticles(): NewsArticle[] {
  return structuredClone(snapshot.articles);
}

export function getLocalDatasetStats(): LocalDatasetStats {
  return { ...snapshot.stats };
}
