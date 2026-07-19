import { createLlmClient } from "@/lib/ai/client";
import {
  hasNewsApiKey,
  hasResendConfiguration,
  serverEnv,
} from "@/lib/config/env";
import { MockEmailSender } from "@/lib/email/mock-email-sender";
import { ResendEmailSender } from "@/lib/email/resend-email-sender";
import { GenericNewsApiProvider } from "@/lib/news/providers/generic-api-provider";
import { DemoNewsProvider } from "@/lib/news/providers/demo-provider";
import { CompositeNewsProvider } from "@/lib/news/providers/composite-provider";
import { DatabaseNewsProvider } from "@/lib/news/providers/database-news-provider";
import { LocalDatasetNewsProvider } from "@/lib/news/providers/local-dataset-provider";
import { PeopleNewsProvider } from "@/lib/news/providers/people-news-provider";
import {
  PUBLIC_HOMEPAGE_SOURCES,
  PublicHomepageNewsProvider,
} from "@/lib/news/providers/public-homepage-provider";
import { RssNewsProvider } from "@/lib/news/providers/rss-news-provider";
import { getConfiguredRssSources } from "@/lib/news/providers/source-registry";
import { createRepositoryBundle } from "@/lib/repositories";
import { MemoryRepository } from "@/lib/repositories/memory-repository";
import { DailyIssueService } from "@/lib/services/daily-issue-service";
import { DeliveryService } from "@/lib/services/delivery-service";
import { NewsSearchService } from "@/lib/services/news-search-service";
import { NewsIngestionService } from "@/lib/services/news-ingestion-service";
import {
  ThemePosterService,
  TopicPosterService,
} from "@/lib/services/poster-services";
import { SubscriptionService } from "@/lib/services/subscription-service";
import { MemoryRateLimitAdapter } from "@/lib/server/rate-limit";

function createContainer() {
  const demoProvider = new DemoNewsProvider();
  const repository = createRepositoryBundle();
  const rssSources = getConfiguredRssSources();
  const newsProviders = [
    ...(serverEnv.NODE_ENV !== "production"
      ? [new LocalDatasetNewsProvider()]
      : []),
    ...(serverEnv.NODE_ENV !== "test"
      ? [
          new PeopleNewsProvider({
            timeoutMs: serverEnv.NEWS_PROVIDER_TIMEOUT_MS,
          }),
          ...PUBLIC_HOMEPAGE_SOURCES.map(
            (source) =>
              new PublicHomepageNewsProvider(source, {
                timeoutMs: serverEnv.NEWS_PROVIDER_TIMEOUT_MS,
              }),
          ),
        ]
      : []),
    ...(rssSources.length > 0
      ? [
          new RssNewsProvider({
            sources: rssSources,
            timeoutMs: serverEnv.NEWS_PROVIDER_TIMEOUT_MS,
          }),
        ]
      : []),
    ...(serverEnv.NODE_ENV !== "test" && hasNewsApiKey()
      ? [new GenericNewsApiProvider()]
      : []),
  ];
  const provider = new CompositeNewsProvider({
    providers: newsProviders,
    fallback: demoProvider,
    allowFallback: serverEnv.NODE_ENV !== "production",
  });
  const databaseProvider = new DatabaseNewsProvider(
    repository,
    serverEnv.NEWS_CACHE_TTL_SECONDS,
  );
  const ingestion = new NewsIngestionService(newsProviders, repository);
  const llm = createLlmClient();
  const news = new NewsSearchService(
    provider,
    Date.now,
    demoProvider,
    repository,
    ingestion,
    serverEnv.NEWS_CACHE_TTL_SECONDS,
  );
  const dailyIssue = new DailyIssueService(news, llm, repository);
  const themePoster = new ThemePosterService(news, llm, repository);
  const topicPoster = new TopicPosterService(news, llm, repository);
  const subscriptions = new SubscriptionService(repository);
  const emailSender = hasResendConfiguration()
    ? new ResendEmailSender({
        apiKey: serverEnv.RESEND_API_KEY ?? "",
        from: serverEnv.EMAIL_FROM ?? "",
      })
    : new MockEmailSender(serverEnv.NODE_ENV === "production");
  const delivery = new DeliveryService(
    dailyIssue,
    repository,
    emailSender,
    serverEnv.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  );
  const rateLimit = new MemoryRateLimitAdapter();

  return {
    provider,
    databaseProvider,
    ingestion,
    repository,
    llm,
    news,
    dailyIssue,
    themePoster,
    topicPoster,
    subscriptions,
    delivery,
    emailSender,
    rateLimit,
    demoUserId: serverEnv.DEMO_USER_ID,
  };
}

let container: ReturnType<typeof createContainer> | null = null;

export function getServerContainer(): ReturnType<typeof createContainer> {
  container ??= createContainer();
  return container;
}

export function resetServerContainerForTests(): void {
  if (container?.repository instanceof MemoryRepository) {
    container.repository.reset();
  }
  container = null;
}
