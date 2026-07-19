import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("服务端环境安全边界", () => {
  it("测试环境即使存在真实配置也强制使用 Mock AI", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LLM_API_KEY", "test-token");
    vi.stubEnv("LLM_BASE_URL", "https://api.deepseek.com");
    vi.stubEnv("LLM_MODEL", "deepseek-v4-pro");
    vi.stubEnv("USE_MOCK_AI", "false");
    vi.resetModules();

    const { shouldUseMockAi } = await import("@/lib/config/env");
    expect(shouldUseMockAi()).toBe(true);
  });
});
