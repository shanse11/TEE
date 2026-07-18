import type { LLMClient, LLMGenerateInput } from "@/types/backend";
import {
  fallbackArticleSummary,
  fallbackDailyIssue,
  fallbackThemePoster,
  fallbackTopicPoster,
} from "@/lib/ai/fallbacks";
import { extractPromptData } from "@/lib/ai/prompts";
import type { NewsArticle } from "@/types";

type PromptPayload = {
  article?: NewsArticle;
  articles?: NewsArticle[];
  topics?: string[];
  theme?: string;
  keyword?: string;
};

/** 测试和无密钥环境的稳定结构化生成器，不使用随机文本。 */
export class MockLLMClient implements LLMClient {
  readonly mode = "mock" as const;
  async generateStructured<T>(input: LLMGenerateInput<T>): Promise<T> {
    const payload = (extractPromptData(input.userPrompt) ?? {}) as PromptPayload;
    let output: unknown;

    if (
      input.systemPrompt.includes("TASK:ARTICLE_SUMMARY") &&
      payload.article
    ) {
      output = fallbackArticleSummary(payload.article);
    } else if (input.systemPrompt.includes("TASK:DAILY_ISSUE")) {
      output = fallbackDailyIssue(
        payload.topics ?? [],
        payload.articles ?? [],
      );
    } else if (input.systemPrompt.includes("TASK:THEME_POSTER")) {
      output = fallbackThemePoster(
        payload.theme ?? "今日主题",
        payload.articles ?? [],
      );
    } else if (input.systemPrompt.includes("TASK:TOPIC_POSTER")) {
      output = fallbackTopicPoster(
        payload.keyword ?? "今日专题",
        payload.articles ?? [],
      );
    } else {
      throw new Error("MockLLMClient 不支持该结构化任务");
    }

    return input.schema.parse(output);
  }
}
