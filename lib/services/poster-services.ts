import type {
  Creation,
  NewsArticle,
  ThemePosterContent,
  TopicPosterContent,
} from "@/types";
import type {
  DataMode,
  LLMClient,
  RepositoryBundle,
  ServiceResult,
} from "@/types/backend";
import { ERROR_CODES } from "@/types/backend";
import { BackendError } from "@/lib/errors";
import {
  creationSchema,
  themePosterContentSchema,
  topicPosterContentSchema,
} from "@/lib/api/schemas";
import {
  themePosterAiSchema,
  topicPosterAiSchema,
} from "@/lib/ai/schemas";
import {
  buildThemePosterPrompt,
  buildTopicPosterPrompt,
} from "@/lib/ai/prompts";
import {
  fallbackThemePoster,
  fallbackTopicPoster,
} from "@/lib/ai/fallbacks";
import { getDemoArticles } from "@/lib/news/providers/demo-provider";
import { stableHash } from "@/lib/security/stable-id";
import { serverEnv } from "@/lib/config/env";
import type { NewsSearchService } from "@/lib/services/news-search-service";

export interface GenerateThemePosterServiceInput {
  userId: string;
  theme: string;
  articleCount: 3 | 4 | 5;
  summaryLength: "brief" | "standard";
  template: "classic" | "modern";
}

export interface GenerateTopicPosterServiceInput {
  userId: string;
  keyword: string;
  selectedArticleIds: string[];
  template: "classic" | "modern";
}

function creationForTheme(poster: ThemePosterContent): Creation {
  return creationSchema.parse({
    id: `creation-${poster.id}`,
    type: "theme_poster",
    title: poster.title,
    description: `${poster.articles.length} 篇新闻的主题聚合`,
    coverImageUrl: "/images/demo/cover-theme.svg",
    createdAt: poster.createdAt,
    href: `/theme-poster/${poster.id}`,
    saved: false,
  });
}

function creationForTopic(poster: TopicPosterContent): Creation {
  return creationSchema.parse({
    id: `creation-${poster.id}`,
    type: "topic_poster",
    title: poster.topicTitle,
    description: `${poster.articles.length} 篇多角度报道的专题聚合`,
    coverImageUrl: "/images/demo/cover-topic.svg",
    createdAt: poster.createdAt,
    href: `/topic-poster/${poster.id}`,
    saved: false,
  });
}

export class ThemePosterService {
  constructor(
    private readonly news: NewsSearchService,
    private readonly llm: LLMClient,
    private readonly repository: RepositoryBundle,
    private readonly now: () => number = Date.now,
    private readonly allowDemoFallback = serverEnv.NODE_ENV !== "production",
  ) {}

  async generate(
    input: GenerateThemePosterServiceInput,
  ): Promise<ServiceResult<ThemePosterContent>> {
    const theme = input.theme.trim();
    if (!theme) {
      throw new BackendError({
        code: ERROR_CODES.INVALID_INPUT,
        message: "请输入有效主题。",
        retryable: false,
      });
    }

    let search = await this.news.search({
      query: theme,
      timeRange: "7d",
      limit: 30,
    });
    if (search.ranked.length < input.articleCount) {
      search = await this.news.search({
        query: theme,
        timeRange: "30d",
        limit: 50,
      });
    }

    let selected = this.news.rankArticles({
      query: theme,
      articles: search.items,
      limit: input.articleCount,
      diversify: true,
    }).items;
    let dataMode = search.dataMode;
    if (selected.length < input.articleCount && this.allowDemoFallback) {
      selected = this.news.rankArticles({
        query: theme,
        articles: getDemoArticles(),
        limit: input.articleCount,
        diversify: true,
      }).items;
      dataMode = "demo";
    }
    if (selected.length < input.articleCount && !this.allowDemoFallback) {
      throw new BackendError({
        code: ERROR_CODES.INSUFFICIENT_ARTICLES,
        message: "当前实时新闻不足，暂时无法生成可靠主题海报。",
        retryable: true,
      });
    }
    if (selected.length < 3) {
      throw new BackendError({
        code: ERROR_CODES.INSUFFICIENT_ARTICLES,
        message: "相关新闻不足 3 篇。",
        retryable: true,
      });
    }

    const prompt = buildThemePosterPrompt(
      theme,
      selected,
      input.summaryLength,
    );
    let generated;
    let aiMode: "live" | "fallback" | "mock" =
      this.llm.mode === "mock" ? "mock" : "live";
    try {
      generated = await this.llm.generateStructured({
        ...prompt,
        schema: themePosterAiSchema,
        temperature: 0.2,
      });
      const expectedIds = selected.map((article) => article.id);
      if (
        generated.articles.map((article) => article.id).join("|") !==
        expectedIds.join("|")
      ) {
        throw new Error("AI 改变了文章集合或顺序");
      }
    } catch {
      generated = fallbackThemePoster(theme, selected);
      aiMode = "fallback";
    }

    const generatedMap = new Map(
      generated.articles.map((article) => [article.id, article]),
    );
    const createdAt = new Date(this.now()).toISOString();
    const poster = themePosterContentSchema.parse({
      id: `theme-${stableHash(
        `${input.userId}|${theme}|${selected.map((article) => article.id).join(",")}|${createdAt.slice(0, 10)}`,
      )}`,
      theme,
      title: generated.topicTitle,
      introduction: generated.introduction,
      articles: selected.map((article) => {
        const generatedArticle = generatedMap.get(article.id);
        return {
          ...article,
          title: generatedArticle?.headline ?? article.title,
          description:
            generatedArticle?.summary ?? article.description,
        };
      }),
      trendSummary: generated.trendSummary,
      keywords: generated.keywords,
      template: input.template,
      createdAt,
    });

    let persisted = this.repository.persistent;
    try {
      await this.repository.saveThemePoster(input.userId, poster);
      await this.repository.saveCreation(
        input.userId,
        creationForTheme(poster),
      );
    } catch (error) {
      if (
        error instanceof BackendError &&
        error.code === ERROR_CODES.DATABASE_UNAVAILABLE
      ) {
        persisted = false;
      } else {
        throw error;
      }
    }

    return {
      data: poster,
      dataMode,
      aiMode,
      degraded: aiMode === "fallback" || dataMode === "degraded",
      persisted,
    };
  }
}

export class TopicPosterService {
  constructor(
    private readonly news: NewsSearchService,
    private readonly llm: LLMClient,
    private readonly repository: RepositoryBundle,
    private readonly now: () => number = Date.now,
    private readonly allowDemoFallback = serverEnv.NODE_ENV !== "production",
  ) {}

  async generate(
    input: GenerateTopicPosterServiceInput,
  ): Promise<ServiceResult<TopicPosterContent>> {
    const keyword = input.keyword.trim();
    const ids = input.selectedArticleIds;
    if (!keyword || ids.length < 3 || ids.length > 5) {
      throw new BackendError({
        code: ERROR_CODES.INVALID_INPUT,
        message: "关键词专题必须选择 3～5 篇文章。",
        retryable: false,
      });
    }
    if (new Set(ids).size !== ids.length) {
      throw new BackendError({
        code: ERROR_CODES.INVALID_INPUT,
        message: "不能重复选择同一篇文章。",
        retryable: false,
      });
    }

    const search = await this.news.search({
      query: keyword,
      timeRange: "30d",
      limit: 50,
    });
    const articles: NewsArticle[] = [];
    for (const id of ids) {
      const article =
        (await this.repository.findArticle(id)) ??
        (this.allowDemoFallback ? this.news.findKnownArticle(id) : null);
      if (!article) {
        throw new BackendError({
          code: ERROR_CODES.NOT_FOUND,
          message: "所选文章已失效，请重新搜索。",
          retryable: false,
        });
      }
      articles.push(article);
    }

    const prompt = buildTopicPosterPrompt(keyword, articles);
    let generated;
    const dataMode: DataMode = search.dataMode;
    let aiMode: "live" | "fallback" | "mock" =
      this.llm.mode === "mock" ? "mock" : "live";
    try {
      generated = await this.llm.generateStructured({
        ...prompt,
        schema: topicPosterAiSchema,
        temperature: 0.2,
      });
      if (
        generated.articles.map((article) => article.id).join("|") !==
        ids.join("|")
      ) {
        throw new Error("AI 改变了文章集合或顺序");
      }
    } catch {
      generated = fallbackTopicPoster(keyword, articles);
      aiMode = "fallback";
    }

    const generatedMap = new Map(
      generated.articles.map((article) => [article.id, article]),
    );
    const createdAt = new Date(this.now()).toISOString();
    const poster = topicPosterContentSchema.parse({
      id: `topic-${stableHash(
        `${input.userId}|${keyword}|${ids.join(",")}|${createdAt.slice(0, 10)}`,
      )}`,
      keyword,
      topicTitle: generated.topicTitle,
      introduction: generated.introduction,
      articles: articles.map((article) => {
        const ai = generatedMap.get(article.id);
        return {
          id: article.id,
          headline: ai?.headline ?? article.title,
          summary: ai?.summary ?? article.description,
          angle: ai?.angle,
          source: article.source,
          sourceUrl: article.sourceUrl,
          publishedAt: article.publishedAt,
          imageUrl: article.imageUrl,
          relevanceScore: article.relevanceScore ?? 0,
        };
      }),
      trendSummary: generated.trendSummary,
      keyTakeaways: generated.keyTakeaways,
      keywords: generated.keywords,
      template: input.template,
      createdAt,
    });

    let persisted = this.repository.persistent;
    try {
      await this.repository.saveTopicPoster(input.userId, poster);
      await this.repository.saveCreation(
        input.userId,
        creationForTopic(poster),
      );
    } catch (error) {
      if (
        error instanceof BackendError &&
        error.code === ERROR_CODES.DATABASE_UNAVAILABLE
      ) {
        persisted = false;
      } else {
        throw error;
      }
    }

    return {
      data: poster,
      dataMode,
      aiMode,
      degraded: aiMode === "fallback" || dataMode === "degraded",
      persisted,
    };
  }
}
