import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { OpenAICompatibleLLMClient } from "@/lib/ai/openai-compatible-client";

const outputSchema = z.object({ summary: z.string().min(1) });

function llmResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("OpenAICompatibleLLMClient", () => {
  it("提取并校验结构化 JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      llmResponse('```json\n{"summary":"稳定摘要"}\n```'),
    );
    const client = new OpenAICompatibleLLMClient({
      apiKey: "test-token",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      fetcher: fetcher as unknown as typeof fetch,
    });
    const result = await client.generateStructured({
      systemPrompt: "返回 JSON",
      userPrompt: "材料",
      schema: outputSchema,
    });
    expect(result.summary).toBe("稳定摘要");
    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0].content).toContain('"summary"');
    expect(body.messages[0].content).toContain("JSON Schema");
  });

  it("无效 JSON 重试一次后返回 AI_INVALID_OUTPUT", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      llmResponse("not-json"),
    );
    const client = new OpenAICompatibleLLMClient({
      apiKey: "test-token",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      fetcher: fetcher as unknown as typeof fetch,
    });
    await expect(
      client.generateStructured({
        systemPrompt: "返回 JSON",
        userPrompt: "材料",
        schema: outputSchema,
      }),
    ).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
