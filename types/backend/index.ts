import type {
  Creation,
  CreationFilters,
  DailyIssue,
  DeliverySettings,
  NewsAngle,
  NewsArticle,
  SearchNewsItem,
  Subscription,
  ThemePosterContent,
  TopicPosterContent,
} from "@/types";
import type { z } from "zod";

/**
 * 后端内部类型。不向前端导出，前端不得依赖这些字段。
 * 与冻结类型 {@link NewsArticle}、{@link SearchNewsItem} 保持兼容。
 */

/** 综合分数的子项拆解，用于可解释排序。所有子分数范围 0～100。 */
export interface ScoreBreakdown {
  relevance: number;
  recency: number;
  sourceQuality: number;
  completeness: number;
  total: number;
}

/** 评分权重集中配置，避免散落在代码中。 */
export const SCORE_WEIGHTS = {
  relevance: 0.5,
  recency: 0.2,
  sourceQuality: 0.15,
  completeness: 0.15,
} as const;

/** 去重阈值集中配置。 */
export const DEDUP_THRESHOLDS = {
  /** 标题字符 2-gram Jaccard 达到此值判定高概率重复。 */
  titleNgram: 0.82,
  /** 标题相似度达标后，再要求摘要相似度达标才判定重复。 */
  titleSimilarity: 0.72,
  summarySimilarity: 0.75,
} as const;

/** 已评分、已标注角度且可能标记重复的文章。 */
export interface RankedNewsArticle {
  article: NewsArticle;
  score: ScoreBreakdown;
  angle: NewsAngle;
  duplicateOf?: string;
}

/** 搜索输入，进入 NewsProvider 前。 */
export interface NewsSearchInput {
  query: string;
  from?: string;
  to?: string;
  limit?: number;
  language?: string;
}

/** 外部新闻数据源适配器接口。领域服务只依赖此接口，不依赖具体 SDK。 */
export interface NewsProvider {
  readonly name: string;
  /** Provider 自身的数据新鲜度；未声明的第三方 Provider 默认按 live 处理。 */
  readonly dataMode?: DataMode;
  search(input: NewsSearchInput, signal?: AbortSignal): Promise<NewsArticle[]>;
}

/** 来源质量等级表条目。未知来源使用中性默认分，不直接判低质量。 */
export interface NewsSourceQualityEntry {
  /** 来源名称规范化后的小写匹配键。 */
  match: string;
  quality: number;
}

/** 数据模式，用于响应 meta.dataMode。 */
export type DataMode = "live" | "cache" | "degraded" | "demo";
export type AiMode = "live" | "fallback" | "mock";

/** 统一响应 meta。 */
export interface ApiMeta {
  requestId: string;
  dataMode: DataMode;
  generatedAt: string;
}

/** 后端扩展错误结构，在前端 ApiError 基础上增加 requestId。 */
export interface BackendApiError {
  code: string;
  message: string;
  retryable: boolean;
  requestId?: string;
}

/** 错误码集中定义，与前端 ApiError.code 对齐。 */
export const ERROR_CODES = {
  INVALID_INPUT: "INVALID_INPUT",
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  DAILY_ISSUE_EXISTS: "DAILY_ISSUE_EXISTS",
  GENERATION_IN_PROGRESS: "GENERATION_IN_PROGRESS",
  NEWS_PROVIDER_UNAVAILABLE: "NEWS_PROVIDER_UNAVAILABLE",
  INSUFFICIENT_ARTICLES: "INSUFFICIENT_ARTICLES",
  AI_UNAVAILABLE: "AI_UNAVAILABLE",
  AI_INVALID_OUTPUT: "AI_INVALID_OUTPUT",
  DATABASE_UNAVAILABLE: "DATABASE_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** 排序、去重所需的候选结果。 */
export interface RankedSearchResult {
  items: SearchNewsItem[];
  ranked: RankedNewsArticle[];
  dataMode: DataMode;
}

/** 供应商无关的结构化生成输入。 */
export interface LLMGenerateInput<T> {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  signal?: AbortSignal;
}

/** 领域服务只依赖此接口，不依赖具体模型 SDK。 */
export interface LLMClient {
  readonly mode?: "live" | "mock";
  generateStructured<T>(input: LLMGenerateInput<T>): Promise<T>;
}

export type GenerationRecordStatus = "processing" | "completed" | "failed";

export interface DailyIssueRecord {
  userId: string;
  issueDate: string;
  status: GenerationRecordStatus;
  issue?: DailyIssue;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}

/** 新闻池中的持久化字段。文章主体继续保持公开 NewsArticle 契约。 */
export interface StoredNewsArticle extends NewsArticle {
  canonicalUrl: string;
  provider: string;
  fetchedAt: string;
  contentHash: string;
  rawMetadata?: Record<string, unknown>;
}

export interface SearchArticlesInput {
  query: string;
  from?: string;
  to?: string;
  limit: number;
  maxAgeSeconds?: number;
}

export interface NewsFetchRun {
  id: string;
  provider: string;
  query: string;
  status: "running" | "completed" | "partial" | "failed";
  fetchedCount: number;
  errorCode?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface DueDeliveryUser {
  userId: string;
  email: string;
  topics: string[];
  keywords: string[];
}

export interface ClaimDeliveryJobInput {
  id: string;
  userId: string;
  issueId: string;
  issueDate: string;
  channel: "email";
  idempotencyKey: string;
}

export interface NewsArticleRepository {
  upsertArticles(articles: StoredNewsArticle[]): Promise<number>;
  searchArticles(input: SearchArticlesInput): Promise<StoredNewsArticle[]>;
  findArticle(id: string): Promise<NewsArticle | null>;
  listRecentArticles(input: {
    since: string;
    limit: number;
  }): Promise<StoredNewsArticle[]>;
  saveNewsFetchRun(run: NewsFetchRun): Promise<void>;
}

export interface SubscriptionRepository {
  listSubscriptions(userId: string): Promise<Subscription[]>;
  getDeliverySettings(userId: string): Promise<DeliverySettings>;
  replaceSubscriptions(
    userId: string,
    subscriptions: Subscription[],
    settings: DeliverySettings,
  ): Promise<void>;
  createSubscription(subscription: Subscription): Promise<Subscription>;
  updateSubscription(
    userId: string,
    id: string,
    patch: Partial<Pick<Subscription, "topic" | "keywords" | "enabled">>,
  ): Promise<Subscription | null>;
  deleteSubscription(userId: string, id: string): Promise<boolean>;
}

export interface DailyIssueRepository {
  findDailyIssue(
    userId: string,
    issueDate: string,
  ): Promise<DailyIssueRecord | null>;
  startDailyIssue(
    userId: string,
    issueDate: string,
    forceRefresh?: boolean,
  ): Promise<DailyIssueRecord>;
  completeDailyIssue(issue: DailyIssue): Promise<DailyIssueRecord>;
  failDailyIssue(
    userId: string,
    issueDate: string,
    errorCode: string,
  ): Promise<void>;
  listDailyIssues(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: DailyIssue[]; total: number }>;
}

export interface PosterRepository {
  saveThemePoster(
    userId: string,
    poster: ThemePosterContent,
  ): Promise<void>;
  saveTopicPoster(
    userId: string,
    poster: TopicPosterContent,
  ): Promise<void>;
  findThemePoster(
    id: string,
    userId?: string,
  ): Promise<ThemePosterContent | null>;
  findTopicPoster(
    id: string,
    userId?: string,
  ): Promise<TopicPosterContent | null>;
}

export interface CreationRepository {
  saveCreation(userId: string, creation: Creation): Promise<Creation>;
  saveCreationByHref(userId: string, href: string): Promise<Creation | null>;
  listCreations(
    userId: string,
    filters: CreationFilters,
  ): Promise<{ items: Creation[]; total: number }>;
}

export interface DeliveryLog {
  id: string;
  userId: string;
  issueId: string;
  channel: "email" | "simulation";
  status: "pending" | "sent" | "failed" | "simulated";
  errorMessage?: string;
  sentAt?: string;
  idempotencyKey: string;
}

export interface DeliveryLogRepository {
  findDeliveryByKey(idempotencyKey: string): Promise<DeliveryLog | null>;
  saveDeliveryLog(log: DeliveryLog): Promise<DeliveryLog>;
  listDueDeliveryUsers(input: {
    deliveryTime: string;
    limit: number;
  }): Promise<DueDeliveryUser[]>;
  claimDeliveryJob(input: ClaimDeliveryJobInput): Promise<boolean>;
}

export interface RepositoryBundle
  extends SubscriptionRepository,
    DailyIssueRepository,
    PosterRepository,
    CreationRepository,
    DeliveryLogRepository,
    NewsArticleRepository {
  /** true 表示数据可跨进程持久化；Memory 为 false。 */
  readonly persistent: boolean;
  readonly mode: "memory" | "supabase";
}

export interface ServiceResult<T> {
  data: T;
  dataMode: DataMode;
  aiMode?: AiMode;
  degraded?: boolean;
  persisted: boolean;
  status?: GenerationRecordStatus | "existing";
}
