import type {
  DeliverySettings,
  SaveSubscriptionsInput,
  Subscription,
  SubscriptionBundle,
} from "@/types";
import type { RepositoryBundle } from "@/types/backend";
import { BackendError } from "@/lib/errors";
import { ERROR_CODES } from "@/types/backend";
import {
  deliverySettingsSchema,
  subscriptionBundleSchema,
  subscriptionSchema,
} from "@/lib/api/schemas";
import { stableHash } from "@/lib/security/stable-id";
import { serverEnv } from "@/lib/config/env";
import { shanghaiDate } from "@/lib/time/shanghai";

function normalizeKeywords(keywords: string[]): string[] {
  return Array.from(
    new Set(
      keywords
        .map((keyword) => keyword.trim())
        .filter(Boolean)
        .map((keyword) => keyword.toLocaleLowerCase("zh-CN")),
    ),
  );
}

export class SubscriptionService {
  constructor(
    private readonly repository: RepositoryBundle,
    private readonly now: () => number = Date.now,
  ) {}

  async getBundle(userId: string): Promise<SubscriptionBundle> {
    const [subscriptions, deliverySettings] = await Promise.all([
      this.repository.listSubscriptions(userId),
      this.repository.getDeliverySettings(userId),
    ]);
    const now = this.now();
    const issueDate = shanghaiDate(now);
    const from = new Date(`${issueDate}T00:00:00+08:00`).toISOString();
    const to = new Date(now).toISOString();
    const subscriptionsWithCounts = await Promise.all(
      subscriptions.map(async (subscription) => {
        const queries = Array.from(
          new Set([subscription.topic, ...subscription.keywords]),
        ).filter(Boolean);
        try {
          const results = await Promise.all(
            queries.map((query) =>
              this.repository.searchArticles({
                query,
                from,
                to,
                limit: 100,
              }),
            ),
          );
          const articleIds = new Set(
            results.flatMap((articles) =>
              articles.map((article) => article.id),
            ),
          );
          return {
            ...subscription,
            todayUpdateCount: articleIds.size,
          };
        } catch {
          return subscription;
        }
      }),
    );
    return subscriptionBundleSchema.parse({
      subscriptions: subscriptionsWithCounts,
      deliverySettings,
    });
  }

  async replaceBundle(
    userId: string,
    input: SaveSubscriptionsInput,
  ): Promise<SubscriptionBundle> {
    this.ensureWritable();
    const now = new Date().toISOString();
    const subscriptions = input.subscriptions.map((item) =>
      subscriptionSchema.parse({
        id:
          item.id ??
          `sub-${stableHash(`${userId}|${item.topic.toLocaleLowerCase("zh-CN")}`)}`,
        userId,
        topic: item.topic.trim(),
        keywords: normalizeKeywords(item.keywords),
        enabled: item.enabled,
        todayUpdateCount: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const settings = deliverySettingsSchema.parse(input.deliverySettings);
    await this.repository.replaceSubscriptions(
      userId,
      subscriptions,
      settings,
    );
    return { subscriptions, deliverySettings: settings };
  }

  async create(
    userId: string,
    input: {
      topic: string;
      keywords?: string[];
      enabled?: boolean;
    },
  ): Promise<Subscription> {
    this.ensureWritable();
    const topic = input.topic.trim();
    if (!topic) {
      throw new BackendError({
        code: ERROR_CODES.INVALID_INPUT,
        message: "订阅主题不能为空。",
        retryable: false,
      });
    }
    const now = new Date().toISOString();
    return this.repository.createSubscription(
      subscriptionSchema.parse({
        id: `sub-${stableHash(`${userId}|${topic}|${now}`)}`,
        userId,
        topic,
        keywords: normalizeKeywords(input.keywords ?? []),
        enabled: input.enabled ?? true,
        todayUpdateCount: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<Pick<Subscription, "topic" | "keywords" | "enabled">>,
  ): Promise<Subscription> {
    this.ensureWritable();
    const normalized = {
      ...patch,
      topic: patch.topic?.trim(),
      keywords: patch.keywords
        ? normalizeKeywords(patch.keywords)
        : undefined,
    };
    const updated = await this.repository.updateSubscription(
      userId,
      id,
      normalized,
    );
    if (!updated) {
      throw new BackendError({
        code: ERROR_CODES.NOT_FOUND,
        message: "订阅不存在。",
        retryable: false,
      });
    }
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    this.ensureWritable();
    const deleted = await this.repository.deleteSubscription(userId, id);
    if (!deleted) {
      throw new BackendError({
        code: ERROR_CODES.NOT_FOUND,
        message: "订阅不存在。",
        retryable: false,
      });
    }
  }

  private ensureWritable(): void {
    if (serverEnv.NODE_ENV === "production" && !this.repository.persistent) {
      throw new BackendError({
        code: ERROR_CODES.DATABASE_UNAVAILABLE,
        message: "生产数据库未配置，订阅未保存。",
        retryable: true,
      });
    }
  }
}

export function defaultDeliverySettings(): DeliverySettings {
  return { email: "", dailyDelivery: false, deliveryTime: "08:00" };
}
