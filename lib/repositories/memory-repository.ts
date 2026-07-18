import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import creationsJson from "@/data/demo/creations.json";
import dailyIssueJson from "@/data/demo/daily-issue.json";
import subscriptionsJson from "@/data/demo/subscriptions.json";
import themePosterJson from "@/data/demo/theme-poster.json";
import topicPosterJson from "@/data/demo/topic-poster.json";
import {
  creationSchema,
  dailyIssueSchema,
  deliverySettingsSchema,
  subscriptionBundleSchema,
  subscriptionSchema,
  themePosterContentSchema,
  topicPosterContentSchema,
} from "@/lib/api/schemas";
import { getDemoArticles } from "@/lib/news/providers/demo-provider";
import { stableHash } from "@/lib/security/stable-id";
import { matchesNewsQuery } from "@/lib/news/providers/query-filter";
import { BackendError } from "@/lib/errors";
import { ERROR_CODES } from "@/types/backend";
import type {
  Creation,
  CreationFilters,
  DailyIssue,
  DeliverySettings,
  NewsArticle,
  Subscription,
  ThemePosterContent,
  TopicPosterContent,
} from "@/types";
import type {
  DailyIssueRecord,
  ClaimDeliveryJobInput,
  DeliveryLog,
  DueDeliveryUser,
  NewsFetchRun,
  RepositoryBundle,
  SearchArticlesInput,
  StoredNewsArticle,
} from "@/types/backend";

type MemoryState = {
  subscriptions: Subscription[];
  settings: Map<string, DeliverySettings>;
  dailyRecords: Map<string, DailyIssueRecord>;
  themePosters: Map<string, ThemePosterContent>;
  topicPosters: Map<string, TopicPosterContent>;
  creations: Creation[];
  deliveryLogs: Map<string, DeliveryLog>;
  articles: Map<string, StoredNewsArticle>;
  fetchRuns: Map<string, NewsFetchRun>;
};

type PersistedMemoryState = {
  subscriptions: Subscription[];
  settings: Array<[string, DeliverySettings]>;
  dailyRecords: Array<[string, DailyIssueRecord]>;
  themePosters: Array<[string, ThemePosterContent]>;
  topicPosters: Array<[string, TopicPosterContent]>;
  creations: Creation[];
};

export type MemoryRepositoryOptions = {
  seedDemo?: boolean;
  persistencePath?: string;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function dailyKey(userId: string, issueDate: string): string {
  return `${userId}\u0000${issueDate}`;
}

function emptyState(): MemoryState {
  return {
    subscriptions: [],
    settings: new Map(),
    dailyRecords: new Map(),
    themePosters: new Map(),
    topicPosters: new Map(),
    creations: [],
    deliveryLogs: new Map(),
    articles: new Map(),
    fetchRuns: new Map(),
  };
}

function initialState(seedDemo: boolean): MemoryState {
  if (!seedDemo) {
    return emptyState();
  }

  const bundle = subscriptionBundleSchema.parse(subscriptionsJson);
  const issue = dailyIssueSchema.parse(dailyIssueJson);
  const theme = themePosterContentSchema.parse(themePosterJson);
  const topic = topicPosterContentSchema.parse(topicPosterJson);
  const now = issue.createdAt;
  const articles = getDemoArticles().map(
    (article): StoredNewsArticle => ({
      ...article,
      canonicalUrl:
        article.sourceUrl ?? `https://todaypaper.invalid/news/${article.id}`,
      provider: "demo",
      fetchedAt: now,
      contentHash: stableHash(
        `${article.title}|${article.description}|${article.publishedAt}`,
      ),
    }),
  );

  return {
    subscriptions: clone(bundle.subscriptions),
    settings: new Map([[issue.userId, clone(bundle.deliverySettings)]]),
    dailyRecords: new Map([
      [
        dailyKey(issue.userId, issue.issueDate),
        {
          userId: issue.userId,
          issueDate: issue.issueDate,
          status: "completed",
          issue: clone(issue),
          createdAt: now,
          updatedAt: now,
        },
      ],
    ]),
    themePosters: new Map([[theme.id, clone(theme)]]),
    topicPosters: new Map([[topic.id, clone(topic)]]),
    creations: creationSchema.array().parse(creationsJson),
    deliveryLogs: new Map(),
    articles: new Map(articles.map((article) => [article.id, article])),
    fetchRuns: new Map(),
  };
}

export class MemoryRepository implements RepositoryBundle {
  readonly persistent: boolean;
  readonly mode = "memory" as const;
  private state: MemoryState;
  private readonly seedDemo: boolean;
  private readonly persistencePath?: string;

  constructor(options?: boolean | MemoryRepositoryOptions) {
    this.seedDemo =
      typeof options === "boolean" ? options : (options?.seedDemo ?? true);
    this.persistencePath =
      typeof options === "object" ? options.persistencePath : undefined;
    this.persistent = Boolean(this.persistencePath);
    this.state = this.loadState();
  }

  reset(): void {
    this.state = initialState(this.seedDemo);
    this.persistState();
  }

  private loadState(): MemoryState {
    const initial = initialState(this.seedDemo);
    if (!this.persistencePath) return initial;
    try {
      const parsed = JSON.parse(
        readFileSync(this.persistencePath, "utf8"),
      ) as Partial<PersistedMemoryState>;
      const subscriptions = subscriptionSchema
        .array()
        .parse(parsed.subscriptions ?? []);
      const settings = new Map(
        (parsed.settings ?? []).map(([userId, value]) => [
          userId,
          deliverySettingsSchema.parse(value),
        ]),
      );
      const dailyRecords = new Map(
        (parsed.dailyRecords ?? []).map(([key, record]) => {
          const issue = record.issue
            ? dailyIssueSchema.parse(record.issue)
            : undefined;
          return [key, { ...record, issue }] as [string, DailyIssueRecord];
        }),
      );
      const themePosters = new Map(
        (parsed.themePosters ?? []).map(([id, poster]) => [
          id,
          themePosterContentSchema.parse(poster),
        ]),
      );
      const topicPosters = new Map(
        (parsed.topicPosters ?? []).map(([id, poster]) => [
          id,
          topicPosterContentSchema.parse(poster),
        ]),
      );
      const creations = creationSchema.array().parse(parsed.creations ?? []);
      return {
        ...initial,
        subscriptions,
        settings,
        dailyRecords,
        themePosters,
        topicPosters,
        creations,
      };
    } catch {
      return initial;
    }
  }

  private persistState(): void {
    if (!this.persistencePath) return;
    const data: PersistedMemoryState = {
      subscriptions: this.state.subscriptions,
      settings: Array.from(this.state.settings.entries()),
      dailyRecords: Array.from(this.state.dailyRecords.entries()),
      themePosters: Array.from(this.state.themePosters.entries()),
      topicPosters: Array.from(this.state.topicPosters.entries()),
      creations: this.state.creations,
    };
    mkdirSync(dirname(this.persistencePath), { recursive: true });
    const temporaryPath = `${this.persistencePath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(data, null, 2), "utf8");
    renameSync(temporaryPath, this.persistencePath);
  }

  async listSubscriptions(userId: string): Promise<Subscription[]> {
    return clone(
      this.state.subscriptions.filter(
        (subscription) => subscription.userId === userId,
      ),
    );
  }

  async getDeliverySettings(userId: string): Promise<DeliverySettings> {
    return clone(
      this.state.settings.get(userId) ?? {
        email: "",
        dailyDelivery: false,
        deliveryTime: "08:00",
      },
    );
  }

  async replaceSubscriptions(
    userId: string,
    subscriptions: Subscription[],
    settings: DeliverySettings,
  ): Promise<void> {
    this.state.subscriptions = [
      ...this.state.subscriptions.filter((item) => item.userId !== userId),
      ...subscriptionSchema.array().parse(subscriptions),
    ];
    this.state.settings.set(
      userId,
      deliverySettingsSchema.parse(settings),
    );
    this.persistState();
  }

  async createSubscription(
    subscription: Subscription,
  ): Promise<Subscription> {
    const parsed = subscriptionSchema.parse(subscription);
    const duplicate = this.state.subscriptions.some(
      (item) =>
        item.userId === parsed.userId &&
        item.topic.toLocaleLowerCase("zh-CN") ===
          parsed.topic.toLocaleLowerCase("zh-CN"),
    );
    if (duplicate) {
      throw new BackendError({
        code: ERROR_CODES.CONFLICT,
        message: "该订阅已存在。",
        retryable: false,
      });
    }
    this.state.subscriptions.push(parsed);
    this.persistState();
    return clone(parsed);
  }

  async updateSubscription(
    userId: string,
    id: string,
    patch: Partial<Pick<Subscription, "topic" | "keywords" | "enabled">>,
  ): Promise<Subscription | null> {
    const index = this.state.subscriptions.findIndex(
      (item) => item.userId === userId && item.id === id,
    );
    if (index < 0) {
      return null;
    }
    const current = this.state.subscriptions[index];
    const updated = subscriptionSchema.parse({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    this.state.subscriptions[index] = updated;
    this.persistState();
    return clone(updated);
  }

  async deleteSubscription(userId: string, id: string): Promise<boolean> {
    const before = this.state.subscriptions.length;
    this.state.subscriptions = this.state.subscriptions.filter(
      (item) => !(item.userId === userId && item.id === id),
    );
    const deleted = this.state.subscriptions.length < before;
    if (deleted) this.persistState();
    return deleted;
  }

  async findDailyIssue(
    userId: string,
    issueDate: string,
  ): Promise<DailyIssueRecord | null> {
    const record = this.state.dailyRecords.get(dailyKey(userId, issueDate));
    return record ? clone(record) : null;
  }

  async startDailyIssue(
    userId: string,
    issueDate: string,
    forceRefresh = false,
  ): Promise<DailyIssueRecord> {
    const key = dailyKey(userId, issueDate);
    const existing = this.state.dailyRecords.get(key);
    if (existing && !forceRefresh) {
      throw new BackendError({
        code:
          existing.status === "processing"
            ? ERROR_CODES.GENERATION_IN_PROGRESS
            : ERROR_CODES.DAILY_ISSUE_EXISTS,
        message:
          existing.status === "processing"
            ? "今日内容正在生成。"
            : "今日份日报已生成。",
        retryable: existing.status === "failed",
      });
    }

    const now = new Date().toISOString();
    const record: DailyIssueRecord = {
      userId,
      issueDate,
      status: "processing",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.state.dailyRecords.set(key, record);
    this.persistState();
    return clone(record);
  }

  async completeDailyIssue(issue: DailyIssue): Promise<DailyIssueRecord> {
    const parsed = dailyIssueSchema.parse(issue);
    const key = dailyKey(parsed.userId, parsed.issueDate);
    const existing = this.state.dailyRecords.get(key);
    const record: DailyIssueRecord = {
      userId: parsed.userId,
      issueDate: parsed.issueDate,
      status: "completed",
      issue: parsed,
      createdAt: existing?.createdAt ?? parsed.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.state.dailyRecords.set(key, record);
    this.persistState();
    return clone(record);
  }

  async failDailyIssue(
    userId: string,
    issueDate: string,
    errorCode: string,
  ): Promise<void> {
    const key = dailyKey(userId, issueDate);
    const existing = this.state.dailyRecords.get(key);
    const now = new Date().toISOString();
    this.state.dailyRecords.set(key, {
      userId,
      issueDate,
      status: "failed",
      errorCode,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    this.persistState();
  }

  async listDailyIssues(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: DailyIssue[]; total: number }> {
    const all = Array.from(this.state.dailyRecords.values())
      .filter(
        (record) =>
          record.userId === userId &&
          record.status === "completed" &&
          record.issue,
      )
      .map((record) => record.issue as DailyIssue)
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
    const offset = (page - 1) * limit;
    return { items: clone(all.slice(offset, offset + limit)), total: all.length };
  }

  async saveThemePoster(
    _userId: string,
    poster: ThemePosterContent,
  ): Promise<void> {
    const parsed = themePosterContentSchema.parse(poster);
    this.state.themePosters.set(parsed.id, parsed);
    this.persistState();
  }

  async saveTopicPoster(
    _userId: string,
    poster: TopicPosterContent,
  ): Promise<void> {
    const parsed = topicPosterContentSchema.parse(poster);
    this.state.topicPosters.set(parsed.id, parsed);
    this.persistState();
  }

  async findThemePoster(id: string): Promise<ThemePosterContent | null> {
    const poster = this.state.themePosters.get(id);
    return poster ? clone(poster) : null;
  }

  async findTopicPoster(id: string): Promise<TopicPosterContent | null> {
    const poster = this.state.topicPosters.get(id);
    return poster ? clone(poster) : null;
  }

  async findArticle(id: string): Promise<NewsArticle | null> {
    const article = this.state.articles.get(id);
    return article ? clone(article) : null;
  }

  async upsertArticles(articles: StoredNewsArticle[]): Promise<number> {
    for (const article of articles) {
      const duplicate = Array.from(this.state.articles.values()).find(
        (item) =>
          item.canonicalUrl === article.canonicalUrl && item.id !== article.id,
      );
      if (duplicate) {
        this.state.articles.delete(duplicate.id);
      }
      this.state.articles.set(article.id, clone(article));
    }
    return articles.length;
  }

  async searchArticles(
    input: SearchArticlesInput,
  ): Promise<StoredNewsArticle[]> {
    const minFetchedAt = input.maxAgeSeconds
      ? Date.now() - input.maxAgeSeconds * 1000
      : Number.NEGATIVE_INFINITY;
    const items = Array.from(this.state.articles.values())
      .filter((article) => {
        if (input.from && article.publishedAt < input.from) return false;
        if (input.to && article.publishedAt > input.to) return false;
        if (Date.parse(article.fetchedAt) < minFetchedAt) return false;
        return matchesNewsQuery(article, input.query);
      })
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, input.limit);
    return clone(items);
  }

  async listRecentArticles(input: {
    since: string;
    limit: number;
  }): Promise<StoredNewsArticle[]> {
    return clone(
      Array.from(this.state.articles.values())
        .filter((article) => article.publishedAt >= input.since)
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .slice(0, input.limit),
    );
  }

  async saveNewsFetchRun(run: NewsFetchRun): Promise<void> {
    this.state.fetchRuns.set(run.id, clone(run));
  }

  async saveCreation(
    _userId: string,
    creation: Creation,
  ): Promise<Creation> {
    const parsed = creationSchema.parse(creation);
    this.state.creations = [
      parsed,
      ...this.state.creations.filter((item) => item.id !== parsed.id),
    ];
    this.persistState();
    return clone(parsed);
  }

  async saveCreationByHref(
    _userId: string,
    href: string,
  ): Promise<Creation | null> {
    const index = this.state.creations.findIndex((item) => item.href === href);
    if (index < 0) {
      return null;
    }
    const updated = creationSchema.parse({
      ...this.state.creations[index],
      saved: true,
    });
    this.state.creations[index] = updated;
    this.persistState();
    return clone(updated);
  }

  async listCreations(
    _userId: string,
    filters: CreationFilters,
  ): Promise<{ items: Creation[]; total: number }> {
    const keyword = filters.keyword?.toLocaleLowerCase("zh-CN");
    const filtered = this.state.creations.filter((creation) => {
      if (
        filters.type &&
        filters.type !== "all" &&
        creation.type !== filters.type
      ) {
        return false;
      }
      if (
        keyword &&
        !`${creation.title} ${creation.description}`
          .toLocaleLowerCase("zh-CN")
          .includes(keyword)
      ) {
        return false;
      }
      const date = creation.createdAt.slice(0, 10);
      if (filters.dateFrom && date < filters.dateFrom) return false;
      if (filters.dateTo && date > filters.dateTo) return false;
      return true;
    });
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 12;
    return {
      items: clone(filtered.slice(offset, offset + limit)),
      total: filtered.length,
    };
  }

  async findDeliveryByKey(
    idempotencyKey: string,
  ): Promise<DeliveryLog | null> {
    const log = this.state.deliveryLogs.get(idempotencyKey);
    return log ? clone(log) : null;
  }

  async saveDeliveryLog(log: DeliveryLog): Promise<DeliveryLog> {
    this.state.deliveryLogs.set(log.idempotencyKey, clone(log));
    return clone(log);
  }

  async listDueDeliveryUsers(input: {
    deliveryTime: string;
    limit: number;
  }): Promise<DueDeliveryUser[]> {
    const users: DueDeliveryUser[] = [];
    for (const [userId, settings] of this.state.settings.entries()) {
      if (
        !settings.dailyDelivery ||
        !settings.email ||
        settings.deliveryTime !== input.deliveryTime
      ) {
        continue;
      }
      const enabled = this.state.subscriptions.filter(
        (subscription) => subscription.userId === userId && subscription.enabled,
      );
      if (enabled.length === 0) continue;
      users.push({
        userId,
        email: settings.email,
        topics: enabled.map((subscription) => subscription.topic),
        keywords: enabled.flatMap((subscription) => subscription.keywords),
      });
      if (users.length >= input.limit) break;
    }
    return clone(users);
  }

  async claimDeliveryJob(input: ClaimDeliveryJobInput): Promise<boolean> {
    if (this.state.deliveryLogs.has(input.idempotencyKey)) {
      return false;
    }
    this.state.deliveryLogs.set(input.idempotencyKey, {
      id: input.id,
      userId: input.userId,
      issueId: input.issueId,
      channel: input.channel,
      status: "pending",
      idempotencyKey: input.idempotencyKey,
    });
    return true;
  }
}
