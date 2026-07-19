import fallbacksJson from "@/data/demo/generation-fallbacks.json";
import type { NewsArticle, NewsAngle } from "@/types";
import { classifyAngle } from "@/lib/news/angles";
import { matchesNewsQuery } from "@/lib/news/providers/query-filter";
import type {
  ArticleSummaryAi,
  DailyIssueAi,
  ThemePosterAi,
  TopicPosterAi,
} from "@/lib/ai/schemas";
import { truncateText } from "@/lib/security/limits";

export function fallbackArticleSummary(
  article: NewsArticle,
): ArticleSummaryAi {
  return {
    conciseTitle: article.title,
    summary: article.description,
    keyPoints: [article.description],
    suggestedCategory: article.category,
    keywords:
      article.keywords.length > 0 ? article.keywords.slice(0, 5) : [article.category],
  };
}

export function fallbackDailyIssue(
  topics: string[],
  articles: NewsArticle[],
): DailyIssueAi {
  const safeTopics = topics.length > 0 ? topics : ["今日关注"];
  const usedArticleIds = new Set<string>();
  const sections = safeTopics.map((topic) => {
    const matching = articles
      .filter(
        (article) =>
          !usedArticleIds.has(article.id) &&
          matchesNewsQuery(article, topic),
      )
      .slice(0, 3);
    const selected =
      matching.length > 0
        ? matching
        : articles
            .filter((article) => !usedArticleIds.has(article.id))
            .slice(0, 1);
    selected.forEach((article) => usedArticleIds.add(article.id));
    return {
      title: topic,
      overview:
        selected.length > 0
          ? `今日“${topic}”重点关注${selected
              .slice(0, 2)
              .map((article) => `“${truncateText(article.title, 32)}”`)
              .join("和")}。`
          : `今日暂未发现足够的“${topic}”相关报道。`,
      articleIds: selected.map((article) => article.id),
    };
  });

  const nonEmptySections = sections.filter(
    (section) => section.articleIds.length > 0,
  );
  const sources = Array.from(
    new Set(articles.map((article) => article.source).filter(Boolean)),
  );
  const topicLabel = safeTopics.map((topic) => `“${topic}”`).join("、");
  const sourceLabel =
    sources.length > 0 ? `，覆盖 ${sources.slice(0, 4).join("、")}` : "";

  return {
    leadArticleId: articles[0]?.id ?? "",
    dailyBriefing: `本期围绕 ${topicLabel} 整理 ${articles.length} 篇候选报道${sourceLabel}。内容按当前订阅方向归类，并保留原始来源与发布时间。`,
    sections: nonEmptySections,
    articleHighlights: nonEmptySections.flatMap((section) =>
      section.articleIds.map((articleId) => {
        const article = articles.find((candidate) => candidate.id === articleId);
        const description = article?.description.trim();
        const takeaway =
          article && description && description !== article.title.trim()
            ? truncateText(description, 120)
            : `这条报道聚焦“${truncateText(article?.title ?? "今日进展", 70)}”，具体信息请结合原文查看。`;
        return {
          articleId,
          headline: truncateText(article?.title ?? "今日进展", 60),
          takeaway,
        };
      }),
    ),
    quickNews: articles.slice(0, 5).map(
      (article) =>
        `${fallbacksJson.quickNewsPrefix}：${truncateText(article.title, 80)}`,
    ),
    watchNext: safeTopics
      .slice(0, 3)
      .map((topic) => `持续关注“${topic}”方向的新进展与后续影响`),
  };
}

export function fallbackThemePoster(
  theme: string,
  articles: NewsArticle[],
): ThemePosterAi {
  return {
    topicTitle: `${theme} · 主题海报`,
    introduction: fallbacksJson.themeIntroduction,
    articles: articles.map((article) => ({
      id: article.id,
      headline: article.title,
      summary: article.description,
    })),
    trendSummary: fallbacksJson.themeTrendSummary,
    keywords: Array.from(
      new Set([theme, ...articles.flatMap((article) => article.keywords)]),
    ).slice(0, 8),
  };
}

function articleAngle(article: NewsArticle): NewsAngle {
  return classifyAngle({
    title: article.title,
    description: article.description,
    keywords: article.keywords,
    category: article.category,
  });
}

export function fallbackTopicPoster(
  keyword: string,
  articles: NewsArticle[],
): TopicPosterAi {
  return {
    topicTitle: `${keyword} · 专题海报`,
    introduction: fallbacksJson.topicIntroduction,
    articles: articles.map((article) => ({
      id: article.id,
      headline: article.title,
      summary: article.description,
      angle: articleAngle(article),
    })),
    trendSummary: fallbacksJson.topicTrendSummary,
    keyTakeaways: articles.slice(0, 3).map((article) => article.description),
    keywords: Array.from(
      new Set([keyword, ...articles.flatMap((article) => article.keywords)]),
    ).slice(0, 8),
  };
}
