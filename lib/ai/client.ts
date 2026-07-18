import type { LLMClient } from "@/types/backend";
import {
  serverEnv,
  shouldUseMockAi,
} from "@/lib/config/env";
import { MockLLMClient } from "@/lib/ai/mock-client";
import { OpenAICompatibleLLMClient } from "@/lib/ai/openai-compatible-client";

export function createLlmClient(): LLMClient {
  if (shouldUseMockAi()) {
    return new MockLLMClient();
  }

  return new OpenAICompatibleLLMClient({
    apiKey: serverEnv.LLM_API_KEY ?? "",
    baseUrl: serverEnv.LLM_BASE_URL ?? "",
    model: serverEnv.LLM_MODEL ?? "",
    timeoutMs: serverEnv.LLM_TIMEOUT_MS,
  });
}
