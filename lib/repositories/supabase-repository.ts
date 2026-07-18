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
import { BackendError } from "@/lib/errors";
import { ERROR_CODES } from "@/types/backend";

type JsonRecord = Record<string, unknown>;

export interface SupabaseRepositoryOptions {
  baseUrl: string;
  serviceRoleKey: string;
  fetcher?: typeof fetch;
}

function databaseError(): BackendError {
  return new BackendError({
    code: ERROR_CODES.DATABASE_UNAVAILABLE,
    message: "数据服务暂时不可用。",
    retryable: true,
  });
}

function articleFromRow(row: JsonRecord): StoredNewsArticle {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    content: row.content_excerpt ? String(row.content_excerpt) : undefined,
    source: String(row.source),
    sourceUrl: String(row.canonical_url),
    publishedAt: String(row.published_at),
    category: String(row.category),
    imageUrl: row.image_url ? String(row.image_url) : undefined,
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    canonicalUrl: String(row.canonical_url),
    provider: String(row.provider),
    fetchedAt: String(row.fetched_at),
    contentHash: String(row.content_hash),
    rawMetadata:
      row.raw_metadata && typeof row.raw_metadata === "object"
        ? (row.raw_metadata as Record<string, unknown>)
        : {},
  };
}

function safeSearchTerm(value: string): string {
  return value.replace(/[%*(),]/g, " ").trim().slice(0, 100);
}

function searchTerms(value: string): string[] {
  const query = safeSearchTerm(value);
  if (!query) return [];
  const words = query.split(/\s+/u).filter(Boolean);
  const bigrams =
    words.length === 1 && query.length > 2
      ? Array.from(
          { length: Math.min(query.length - 1, 4) },
          (_, index) => query.slice(index, index + 2),
        )
      : [];
  return Array.from(new Set([query, ...words, ...bigrams])).slice(0, 6);
}

/**
 * 轻量 PostgREST Adapter。仅服务端加载 Service Role Key；
 * 所有数据库错误都转换为安全领域错误，不记录记录正文或邮箱。
 */
export class SupabaseRepository implements RepositoryBundle {
  readonly persistent = true;
  readonly mode = "supabase" as const;
  private readonly restUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: SupabaseRepositoryOptions) {
    const base = new URL(options.baseUrl);
    if (base.protocol !== "https:") {
      throw new Error("Supabase URL 必须使用 HTTPS");
    }
    this.restUrl = `${base.toString().replace(/\/$/, "")}/rest/v1`;
    this.fetcher = options.fetcher ?? fetch;
  }

  private async request<T>(
    table: string,
    init: RequestInit & { query?: string } = {},
  ): Promise<T> {
    const response = await this.fetcher(
      `${this.restUrl}/${table}${init.query ? `?${init.query}` : ""}`,
      {
        ...init,
        headers: {
          apikey: this.options.serviceRoleKey,
          Authorization: `Bearer ${this.options.serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          ...init.headers,
        },
      },
    ).catch(() => {
      throw databaseError();
    });

    if (!response.ok) {
      throw databaseError();
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  async listSubscriptions(userId: string): Promise<Subscription[]> {
    const rows = await this.request<JsonRecord[]>("subscriptions", {
      query: `user_id=eq.${encodeURIComponent(userId)}&select=*`,
    });
    return rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      topic: String(row.topic),
      keywords: Array.isArray(row.keywords)
        ? row.keywords.map(String)
        : [],
      enabled: Boolean(row.enabled),
      todayUpdateCount: Number(row.today_update_count ?? 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at ?? row.created_at),
    }));
  }

  async getDeliverySettings(userId: string): Promise<DeliverySettings> {
    const rows = await this.request<JsonRecord[]>("delivery_settings", {
      query: `user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
    });
    const row = rows[0];
    return row
      ? {
          email: String(row.email ?? ""),
          dailyDelivery: Boolean(row.delivery_enabled),
          deliveryTime: "08:00",
        }
      : { email: "", dailyDelivery: false, deliveryTime: "08:00" };
  }

  async replaceSubscriptions(
    userId: string,
    subscriptions: Subscription[],
    settings: DeliverySettings,
  ): Promise<void> {
    await this.request<void>("subscriptions", {
      method: "DELETE",
      query: `user_id=eq.${encodeURIComponent(userId)}`,
    });
    if (subscriptions.length > 0) {
      await this.request<JsonRecord[]>("subscriptions", {
        method: "POST",
        body: JSON.stringify(
          subscriptions.map((item) => ({
            id: item.id,
            user_id: userId,
            topic: item.topic,
            keywords: item.keywords,
            enabled: item.enabled,
            today_update_count: item.todayUpdateCount,
            created_at: item.createdAt,
            updated_at: item.updatedAt,
          })),
        ),
      });
    }
    await this.request<JsonRecord[]>("delivery_settings", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        user_id: userId,
        delivery_enabled: settings.dailyDelivery,
        delivery_time: settings.deliveryTime,
        email: settings.email || null,
        email_enabled: settings.dailyDelivery,
      }),
    });
  }

  async createSubscription(
    subscription: Subscription,
  ): Promise<Subscription> {
    const rows = await this.request<JsonRecord[]>("subscriptions", {
      method: "POST",
      body: JSON.stringify({
        id: subscription.id,
        user_id: subscription.userId,
        topic: subscription.topic,
        keywords: subscription.keywords,
        enabled: subscription.enabled,
        today_update_count: subscription.todayUpdateCount,
        created_at: subscription.createdAt,
        updated_at: subscription.updatedAt,
      }),
    });
    return rows[0] ? subscription : subscription;
  }

  async updateSubscription(
    userId: string,
    id: string,
    patch: Partial<Pick<Subscription, "topic" | "keywords" | "enabled">>,
  ): Promise<Subscription | null> {
    const body: JsonRecord = { updated_at: new Date().toISOString() };
    if (patch.topic !== undefined) body.topic = patch.topic;
    if (patch.keywords !== undefined) body.keywords = patch.keywords;
    if (patch.enabled !== undefined) body.enabled = patch.enabled;
    const rows = await this.request<JsonRecord[]>("subscriptions", {
      method: "PATCH",
      query: `user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(id)}`,
      body: JSON.stringify(body),
    });
    if (!rows[0]) return null;
    const subscriptions = await this.listSubscriptions(userId);
    return subscriptions.find((item) => item.id === id) ?? null;
  }

  async deleteSubscription(userId: string, id: string): Promise<boolean> {
    const rows = await this.request<JsonRecord[]>("subscriptions", {
      method: "DELETE",
      query: `user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(id)}`,
    });
    return rows.length > 0;
  }

  async findDailyIssue(
    userId: string,
    issueDate: string,
  ): Promise<DailyIssueRecord | null> {
    const rows = await this.request<JsonRecord[]>("daily_issues", {
      query: `user_id=eq.${encodeURIComponent(userId)}&issue_date=eq.${issueDate}&select=*&limit=1`,
    });
    const row = rows[0];
    if (!row) return null;
    return {
      userId,
      issueDate,
      status: String(row.generation_status) as DailyIssueRecord["status"],
      issue: row.content_json as DailyIssue | undefined,
      errorCode: row.error_code ? String(row.error_code) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async startDailyIssue(
    userId: string,
    issueDate: string,
    forceRefresh = false,
  ): Promise<DailyIssueRecord> {
    const existing = await this.findDailyIssue(userId, issueDate);
    const now = new Date().toISOString();
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
    if (existing) {
      await this.request<JsonRecord[]>("daily_issues", {
        method: "PATCH",
        query: `user_id=eq.${encodeURIComponent(userId)}&issue_date=eq.${issueDate}`,
        body: JSON.stringify({
          generation_status: "processing",
          error_code: null,
          updated_at: now,
        }),
      });
    } else {
      await this.request<JsonRecord[]>("daily_issues", {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          issue_date: issueDate,
          generation_status: "processing",
          error_code: null,
          updated_at: now,
          created_at: now,
        }),
      });
    }
    return {
      userId,
      issueDate,
      status: "processing",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  async completeDailyIssue(issue: DailyIssue): Promise<DailyIssueRecord> {
    const now = new Date().toISOString();
    await this.request<JsonRecord[]>("daily_issues", {
      method: "PATCH",
      query: `user_id=eq.${encodeURIComponent(issue.userId)}&issue_date=eq.${issue.issueDate}`,
      body: JSON.stringify({
        topics: issue.topics,
        content_json: issue,
        generation_status: "completed",
        error_code: null,
        updated_at: now,
      }),
    });
    return {
      userId: issue.userId,
      issueDate: issue.issueDate,
      status: "completed",
      issue,
      createdAt: issue.createdAt,
      updatedAt: now,
    };
  }

  async failDailyIssue(
    userId: string,
    issueDate: string,
    errorCode: string,
  ): Promise<void> {
    await this.request<JsonRecord[]>("daily_issues", {
      method: "PATCH",
      query: `user_id=eq.${encodeURIComponent(userId)}&issue_date=eq.${issueDate}`,
      body: JSON.stringify({
        generation_status: "failed",
        error_code: errorCode,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  async listDailyIssues(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: DailyIssue[]; total: number }> {
    const offset = (page - 1) * limit;
    const rows = await this.request<JsonRecord[]>("daily_issues", {
      query: `user_id=eq.${encodeURIComponent(userId)}&generation_status=eq.completed&select=content_json&order=issue_date.desc&offset=${offset}&limit=${limit}`,
    });
    return {
      items: rows
        .map((row) => row.content_json as DailyIssue)
        .filter(Boolean),
      total: rows.length < limit ? offset + rows.length : offset + rows.length + 1,
    };
  }

  async saveThemePoster(
    userId: string,
    poster: ThemePosterContent,
  ): Promise<void> {
    await this.request<JsonRecord[]>("theme_posters", {
      method: "POST",
      body: JSON.stringify({
        id: poster.id,
        user_id: userId,
        theme: poster.theme,
        article_ids: poster.articles.map((article) => article.id),
        content_json: poster,
        template: poster.template,
        created_at: poster.createdAt,
      }),
    });
  }

  async saveTopicPoster(
    userId: string,
    poster: TopicPosterContent,
  ): Promise<void> {
    await this.request<JsonRecord[]>("topic_posters", {
      method: "POST",
      body: JSON.stringify({
        id: poster.id,
        user_id: userId,
        keyword: poster.keyword,
        article_ids: poster.articles.map((article) => article.id),
        content_json: poster,
        template: poster.template,
        created_at: poster.createdAt,
      }),
    });
  }

  async findThemePoster(
    id: string,
    userId?: string,
  ): Promise<ThemePosterContent | null> {
    const owner = userId
      ? `&user_id=eq.${encodeURIComponent(userId)}`
      : "";
    const rows = await this.request<JsonRecord[]>("theme_posters", {
      query: `id=eq.${encodeURIComponent(id)}${owner}&select=content_json&limit=1`,
    });
    return (rows[0]?.content_json as ThemePosterContent | undefined) ?? null;
  }

  async findTopicPoster(
    id: string,
    userId?: string,
  ): Promise<TopicPosterContent | null> {
    const owner = userId
      ? `&user_id=eq.${encodeURIComponent(userId)}`
      : "";
    const rows = await this.request<JsonRecord[]>("topic_posters", {
      query: `id=eq.${encodeURIComponent(id)}${owner}&select=content_json&limit=1`,
    });
    return (rows[0]?.content_json as TopicPosterContent | undefined) ?? null;
  }

  async findArticle(id: string): Promise<NewsArticle | null> {
    const rows = await this.request<JsonRecord[]>("news_articles", {
      query: `id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    });
    return rows[0] ? articleFromRow(rows[0]) : null;
  }

  async upsertArticles(articles: StoredNewsArticle[]): Promise<number> {
    if (articles.length === 0) return 0;
    const rows = await this.request<JsonRecord[]>("news_articles", {
      method: "POST",
      query: "on_conflict=canonical_url",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(
        articles.map((article) => ({
          id: article.id,
          canonical_url: article.canonicalUrl,
          provider: article.provider,
          source: article.source,
          title: article.title,
          description: article.description,
          content_excerpt: article.content ?? null,
          image_url: article.imageUrl ?? null,
          category: article.category,
          keywords: article.keywords,
          published_at: article.publishedAt,
          fetched_at: article.fetchedAt,
          content_hash: article.contentHash,
          raw_metadata: article.rawMetadata ?? {},
          updated_at: new Date().toISOString(),
        })),
      ),
    });
    return rows.length;
  }

  async searchArticles(
    input: SearchArticlesInput,
  ): Promise<StoredNewsArticle[]> {
    const clauses = [
      "select=*",
      "order=published_at.desc",
      `limit=${input.limit}`,
    ];
    const terms = searchTerms(input.query);
    if (terms.length > 0) {
      const filters = terms.flatMap((term) => {
        const pattern = encodeURIComponent(`*${term}*`);
        return [
          `title.ilike.${pattern}`,
          `description.ilike.${pattern}`,
          `category.ilike.${pattern}`,
        ];
      });
      clauses.push(`or=(${filters.join(",")})`);
    }
    if (input.from) {
      clauses.push(`published_at=gte.${encodeURIComponent(input.from)}`);
    }
    if (input.to) {
      clauses.push(`published_at=lte.${encodeURIComponent(input.to)}`);
    }
    if (input.maxAgeSeconds) {
      const fetchedAfter = new Date(
        Date.now() - input.maxAgeSeconds * 1000,
      ).toISOString();
      clauses.push(`fetched_at=gte.${encodeURIComponent(fetchedAfter)}`);
    }
    const rows = await this.request<JsonRecord[]>("news_articles", {
      query: clauses.join("&"),
    });
    return rows.map(articleFromRow);
  }

  async listRecentArticles(input: {
    since: string;
    limit: number;
  }): Promise<StoredNewsArticle[]> {
    const rows = await this.request<JsonRecord[]>("news_articles", {
      query: [
        "select=*",
        `published_at=gte.${encodeURIComponent(input.since)}`,
        "order=published_at.desc",
        `limit=${input.limit}`,
      ].join("&"),
    });
    return rows.map(articleFromRow);
  }

  async saveNewsFetchRun(run: NewsFetchRun): Promise<void> {
    await this.request<JsonRecord[]>("news_fetch_runs", {
      method: "POST",
      query: "on_conflict=id",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        id: run.id,
        provider: run.provider,
        query: run.query,
        status: run.status,
        fetched_count: run.fetchedCount,
        error_code: run.errorCode ?? null,
        started_at: run.startedAt,
        finished_at: run.finishedAt ?? null,
      }),
    });
  }

  async saveCreation(
    userId: string,
    creation: Creation,
  ): Promise<Creation> {
    await this.request<JsonRecord[]>("creations", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        id: creation.id,
        user_id: userId,
        type: creation.type,
        title: creation.title,
        description: creation.description,
        cover_image_url: creation.coverImageUrl,
        created_at: creation.createdAt,
        href: creation.href,
        saved: creation.saved,
      }),
    });
    return creation;
  }

  async saveCreationByHref(
    userId: string,
    href: string,
  ): Promise<Creation | null> {
    await this.request<JsonRecord[]>("creations", {
      method: "PATCH",
      query: `user_id=eq.${encodeURIComponent(userId)}&href=eq.${encodeURIComponent(href)}`,
      body: JSON.stringify({ saved: true }),
    });
    const { items } = await this.listCreations(userId, {
      keyword: "",
      offset: 0,
      limit: 50,
    });
    return items.find((item) => item.href === href) ?? null;
  }

  async listCreations(
    userId: string,
    filters: CreationFilters,
  ): Promise<{ items: Creation[]; total: number }> {
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 12;
    const clauses = [
      `user_id=eq.${encodeURIComponent(userId)}`,
      "select=*",
      "order=created_at.desc",
      `offset=${offset}`,
      `limit=${limit}`,
    ];
    if (filters.type && filters.type !== "all") {
      clauses.push(`type=eq.${filters.type}`);
    }
    const rows = await this.request<JsonRecord[]>("creations", {
      query: clauses.join("&"),
    });
    const items = rows.map((row) => ({
      id: String(row.id),
      type: row.type as Creation["type"],
      title: String(row.title),
      description: String(row.description),
      coverImageUrl: String(row.cover_image_url),
      createdAt: String(row.created_at),
      href: String(row.href),
      saved: Boolean(row.saved),
    }));
    const keyword = filters.keyword?.toLocaleLowerCase("zh-CN");
    const filtered = keyword
      ? items.filter((item) =>
          `${item.title} ${item.description}`
            .toLocaleLowerCase("zh-CN")
            .includes(keyword),
        )
      : items;
    return {
      items: filtered,
      total: rows.length < limit ? offset + rows.length : offset + rows.length + 1,
    };
  }

  async findDeliveryByKey(
    idempotencyKey: string,
  ): Promise<DeliveryLog | null> {
    const rows = await this.request<JsonRecord[]>("delivery_logs", {
      query: `idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=*&limit=1`,
    });
    const row = rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      issueId: String(row.issue_id),
      channel: row.channel as DeliveryLog["channel"],
      status: row.status as DeliveryLog["status"],
      errorMessage: row.error_message
        ? String(row.error_message)
        : undefined,
      sentAt: row.sent_at ? String(row.sent_at) : undefined,
      idempotencyKey: String(row.idempotency_key),
    };
  }

  async saveDeliveryLog(log: DeliveryLog): Promise<DeliveryLog> {
    await this.request<JsonRecord[]>("delivery_logs", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        id: log.id,
        user_id: log.userId,
        issue_id: log.issueId,
        channel: log.channel,
        status: log.status,
        error_message: log.errorMessage ?? null,
        sent_at: log.sentAt ?? null,
        idempotency_key: log.idempotencyKey,
      }),
    });
    return log;
  }

  async listDueDeliveryUsers(input: {
    deliveryTime: string;
    limit: number;
  }): Promise<DueDeliveryUser[]> {
    const settings = await this.request<JsonRecord[]>("delivery_settings", {
      query: [
        "delivery_enabled=eq.true",
        "email_enabled=eq.true",
        "email=not.is.null",
        `delivery_time=eq.${encodeURIComponent(input.deliveryTime)}`,
        "select=user_id,email",
        `limit=${input.limit}`,
      ].join("&"),
    });
    const users: DueDeliveryUser[] = [];
    for (const row of settings) {
      const userId = String(row.user_id);
      const subscriptions = await this.listSubscriptions(userId);
      const enabled = subscriptions.filter((subscription) => subscription.enabled);
      if (enabled.length === 0) continue;
      users.push({
        userId,
        email: String(row.email),
        topics: enabled.map((subscription) => subscription.topic),
        keywords: enabled.flatMap((subscription) => subscription.keywords),
      });
    }
    return users;
  }

  async claimDeliveryJob(input: ClaimDeliveryJobInput): Promise<boolean> {
    const rows = await this.request<JsonRecord[]>("delivery_logs", {
      method: "POST",
      query: "on_conflict=idempotency_key",
      headers: {
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify({
        id: input.id,
        user_id: input.userId,
        issue_id: input.issueId,
        channel: input.channel,
        status: "pending",
        idempotency_key: input.idempotencyKey,
      }),
    });
    return rows.length > 0;
  }
}
