import { z } from "zod";
import { newsAngleSchema } from "@/lib/api/schemas";

export const articleSummaryAiSchema = z.object({
  conciseTitle: z.string().min(1).max(120),
  summary: z.string().min(1).max(500),
  keyPoints: z.array(z.string().min(1).max(200)).min(1).max(5),
  suggestedCategory: z.string().min(1).max(50),
  keywords: z.array(z.string().min(1).max(50)).min(1).max(10),
});

export const dailyIssueAiSchema = z.object({
  leadArticleId: z.string().min(1),
  dailyBriefing: z.string().min(1).max(1200),
  sections: z
    .array(
      z.object({
        title: z.string().min(1).max(50),
        overview: z.string().min(20).max(240),
        articleIds: z.array(z.string().min(1)).min(1).max(3),
      }),
    )
    .min(1),
  articleHighlights: z
    .array(
      z.object({
        articleId: z.string().min(1),
        headline: z.string().min(5).max(60),
        takeaway: z.string().min(20).max(180),
      }),
    )
    .min(1)
    .max(12),
  quickNews: z.array(z.string().min(1).max(240)).min(1).max(8),
  watchNext: z.array(z.string().min(1).max(240)).min(1).max(6),
});

export const themePosterAiSchema = z.object({
  topicTitle: z.string().min(1).max(100),
  introduction: z.string().min(1).max(800),
  articles: z
    .array(
      z.object({
        id: z.string().min(1),
        headline: z.string().min(1).max(120),
        summary: z.string().min(1).max(500),
      }),
    )
    .min(3)
    .max(5),
  trendSummary: z.string().min(1).max(1000),
  keywords: z.array(z.string().min(1).max(50)).min(1).max(10),
});

export const topicPosterAiSchema = z.object({
  topicTitle: z.string().min(1).max(100),
  introduction: z.string().min(1).max(800),
  articles: z
    .array(
      z.object({
        id: z.string().min(1),
        headline: z.string().min(1).max(120),
        summary: z.string().min(1).max(500),
        angle: newsAngleSchema,
      }),
    )
    .min(3)
    .max(5),
  trendSummary: z.string().min(1).max(1000),
  keyTakeaways: z.array(z.string().min(1).max(300)).min(1).max(6),
  keywords: z.array(z.string().min(1).max(50)).min(1).max(10),
});

export type ArticleSummaryAi = z.infer<typeof articleSummaryAiSchema>;
export type DailyIssueAi = z.infer<typeof dailyIssueAiSchema>;
export type ThemePosterAi = z.infer<typeof themePosterAiSchema>;
export type TopicPosterAi = z.infer<typeof topicPosterAiSchema>;
