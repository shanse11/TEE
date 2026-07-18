import type { DailyIssue, NewsArticle } from "@/types";
import type {
  DataMode,
  LLMClient,
  RepositoryBundle,
  ServiceResult,
} from "@/types/backend";
import { ERROR_CODES } from "@/types/backend";
import { BackendError } from "@/lib/errors";
import { dailyIssueSchema, creationSchema } from "@/lib/api/schemas";
import { dailyIssueAiSchema } from "@/lib/ai/schemas";
import { buildDailyIssuePrompt } from "@/lib/ai/prompts";
import { fallbackDailyIssue } from "@/lib/ai/fallbacks";
import { getDemoArticles } from "@/lib/news/providers/demo-provider";
import { stableHash } from "@/lib/security/stable-id";
import { serverEnv } from "@/lib/config/env";
import { shanghaiDate } from "@/lib/time/shanghai";
import type { NewsSearchService } from "@/lib/services/news-search-service";

export interface GenerateDailyIssueServiceInput {
  userId: string;
  issueDate?: string;
  topics: string[];
  forceRefresh?: boolean;
}

function uniqueTopics(topics: string[]): string[] {
  return Array.from(
    new Set(topics.map((topic) => topic.trim()).filter(Boolean)),
  ).slice(0, 8);
}

function uniqueArticles(articles: NewsArticle[]): NewsArticle[] {
  return Array.from(
    new Map(articles.map((article) => [article.id, article])).values(),
  );
}

export class DailyIssueService {
  constructor(
    private readonly news: NewsSearchService,
    private readonly llm: LLMClient,
    private readonly repository: RepositoryBundle,
    private readonly now: () => number = Date.now,
    private readonly allowDemoFallback = serverEnv.NODE_ENV !== "production",
  ) {}

  async generate(
    input: GenerateDailyIssueServiceInput,
  ): Promise<ServiceResult<DailyIssue>> {
    const enabledSubscriptions = (
      await this.repository.listSubscriptions(input.userId)
    ).filter((subscription) => subscription.enabled);
    const subscribedTopics = enabledSubscriptions.map(
      (subscription) => subscription.topic,
    );
    const topics = uniqueTopics(
      subscribedTopics.length > 0 ? subscribedTopics : input.topics,
    );
    const queries = uniqueTopics([
      ...topics,
      ...enabledSubscriptions.flatMap(
        (subscription) => subscription.keywords,
      ),
    ]);
    if (topics.length === 0) {
      throw new BackendError({
        code: ERROR_CODES.INVALID_INPUT,
        message: "请至少选择一个订阅主题。",
        retryable: false,
      });
    }
    const issueDate = input.issueDate ?? shanghaiDate(this.now());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
      throw new BackendError({
        code: ERROR_CODES.INVALID_INPUT,
        message: "日报日期格式无效。",
        retryable: false,
      });
    }

    let repositoryAvailable = true;
    try {
      const existing = await this.repository.findDailyIssue(
        input.userId,
        issueDate,
      );
      if (
        existing?.status === "completed" &&
        existing.issue &&
        !input.forceRefresh
      ) {
        return {
          data: existing.issue,
          dataMode: this.repository.mode === "memory" ? "demo" : "cache",
          persisted: this.repository.persistent,
          aiMode: this.llm.mode === "mock" ? "mock" : "live",
          status: "existing",
        };
      }
      if (existing?.status === "processing" && !input.forceRefresh) {
        throw new BackendError({
          code: ERROR_CODES.GENERATION_IN_PROGRESS,
          message: "今日内容正在生成。",
          retryable: true,
        });
      }
      await this.repository.startDailyIssue(
        input.userId,
        issueDate,
        input.forceRefresh,
      );
    } catch (error) {
      if (
        error instanceof BackendError &&
        error.code === ERROR_CODES.DATABASE_UNAVAILABLE
      ) {
        repositoryAvailable = false;
      } else {
        throw error;
      }
    }

    try {
      const collected: NewsArticle[] = [];
      let dataMode: DataMode = "live";
      for (let offset = 0; offset < queries.length; offset += 4) {
        const batch = queries.slice(offset, offset + 4);
        const results = await Promise.all(
          batch.map((query) =>
            this.news.search({
              query,
              timeRange: "24h",
              limit: 10,
            }),
          ),
        );
        for (const result of results) {
          collected.push(...result.items.slice(0, 3));
          if (result.dataMode !== "live") {
            dataMode = result.dataMode;
          }
        }
      }

      let articles = uniqueArticles(collected);
      if (
        articles.length < Math.min(5, topics.length * 2) &&
        this.allowDemoFallback
      ) {
        articles = uniqueArticles([...articles, ...getDemoArticles()]);
        dataMode = "demo";
      }
      if (
        articles.length < Math.min(5, Math.max(3, topics.length * 2)) &&
        !this.allowDemoFallback
      ) {
        throw new BackendError({
          code: ERROR_CODES.INSUFFICIENT_ARTICLES,
          message: "当前实时新闻不足，暂时无法生成可靠日报。",
          retryable: true,
        });
      }
      articles = articles.slice(0, 8);
      if (articles.length === 0) {
        throw new BackendError({
          code: ERROR_CODES.INSUFFICIENT_ARTICLES,
          message: "没有足够的新闻生成日报。",
          retryable: true,
        });
      }

      const prompt = buildDailyIssuePrompt(topics, articles);
      let generated;
      let aiMode: "live" | "fallback" | "mock" =
        this.llm.mode === "mock" ? "mock" : "live";
      try {
        generated = await this.llm.generateStructured({
          ...prompt,
          schema: dailyIssueAiSchema,
          temperature: 0.2,
        });
        this.validateGeneratedArticleIds(generated, articles);
      } catch {
        generated = fallbackDailyIssue(topics, articles);
        aiMode = "fallback";
      }

      const articleMap = new Map(
        articles.map((article) => [article.id, article]),
      );
      const used = new Set<string>();
      const sections = generated.sections
        .map((section) => ({
          title: section.title,
          summary: section.overview,
          articles: section.articleIds
            .filter((id) => {
              if (used.has(id)) return false;
              used.add(id);
              return articleMap.has(id);
            })
            .map((id) => articleMap.get(id) as NewsArticle),
        }))
        .filter((section) => section.articles.length > 0);
      const selectedArticleIds = new Set(
        sections.flatMap((section) =>
          section.articles.map((article) => article.id),
        ),
      );
      const articleHighlights = generated.articleHighlights.filter(
        (highlight) => selectedArticleIds.has(highlight.articleId),
      );

      const leadArticleId = sections
        .flatMap((section) => section.articles)
        .some((article) => article.id === generated.leadArticleId)
        ? generated.leadArticleId
        : sections[0]?.articles[0]?.id;

      const createdAt = new Date(this.now()).toISOString();
      const issue = dailyIssueSchema.parse({
        id: `daily-${stableHash(`${input.userId}|${issueDate}`)}`,
        userId: input.userId,
        issueDate,
        newspaperName: "今日报纸",
        topics,
        leadArticleId,
        dailyBriefing: generated.dailyBriefing,
        sections,
        articleHighlights,
        quickNews: generated.quickNews,
        watchNext: generated.watchNext,
        createdAt,
      });

      if (repositoryAvailable) {
        await this.repository.completeDailyIssue(issue);
        await this.repository.saveCreation(
          input.userId,
          creationSchema.parse({
            id: `creation-${issue.id}`,
            type: "daily_issue",
            title: `${issue.issueDate} 个人日报`,
            description: issue.dailyBriefing,
            coverImageUrl: "/images/demo/cover-daily.svg",
            createdAt: issue.createdAt,
            href: `/newspaper/${issue.id}`,
            saved: true,
          }),
        );
      }

      return {
        data: issue,
        dataMode,
        aiMode,
        degraded: aiMode === "fallback" || dataMode === "degraded",
        persisted: repositoryAvailable && this.repository.persistent,
        status: "completed",
      };
    } catch (error) {
      if (repositoryAvailable) {
        await this.repository.failDailyIssue(
          input.userId,
          issueDate,
          error instanceof BackendError
            ? error.code
            : ERROR_CODES.INTERNAL_ERROR,
        );
      }
      throw error;
    }
  }

  private validateGeneratedArticleIds(
    generated: {
      leadArticleId: string;
      sections: { articleIds: string[] }[];
      articleHighlights: { articleId: string }[];
    },
    articles: NewsArticle[],
  ): void {
    const allowed = new Set(articles.map((article) => article.id));
    const ids = generated.sections.flatMap((section) => section.articleIds);
    const highlightIds = generated.articleHighlights.map(
      (highlight) => highlight.articleId,
    );
    const selected = new Set(ids);
    if (
      !allowed.has(generated.leadArticleId) ||
      ids.some((id) => !allowed.has(id)) ||
      new Set(ids).size !== ids.length ||
      highlightIds.some((id) => !selected.has(id)) ||
      new Set(highlightIds).size !== highlightIds.length
    ) {
      throw new BackendError({
        code: ERROR_CODES.AI_INVALID_OUTPUT,
        message: "AI 返回了不属于输入集合的文章。",
        retryable: true,
      });
    }
  }
}
