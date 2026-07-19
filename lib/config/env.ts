import { z } from "zod";

/**
 * 服务端环境变量解析。只判断存在性，不打印任何值。
 * 前端 .env.example 已使用 LLM_* / NEWS_API_KEY 命名，此处统一沿用，不引入第二套。
 */

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** AI */
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  /** 是否强制使用 Mock AI。 */
  USE_MOCK_AI: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  /** 新闻源 */
  NEWS_API_KEY: z.string().optional(),
  NEWS_API_BASE_URL: z.string().url().optional(),
  NEWS_API_DOMAINS: z.string().optional(),
  NEWS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  NEWS_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  NEWS_RSS_SOURCES: z.string().optional(),
  NEWS_INGEST_QUERIES: z.string().optional(),
  /** Supabase */
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  /** 邮件与定时任务。 */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  APP_TIMEZONE: z.string().default("Asia/Shanghai"),
  /** 演示用户 ID。 */
  DEMO_USER_ID: z.string().default("demo-user"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function parseEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (parsed.success) {
    return parsed.data;
  }
  // 环境变量格式异常不阻塞启动，回退到默认。
  return serverEnvSchema.parse({
    NODE_ENV: process.env.NODE_ENV ?? "development",
  });
}

export const serverEnv = parseEnv();

/** 仅判断 AI 密钥是否存在，不暴露值。 */
export function hasLlmKey(): boolean {
  return Boolean(serverEnv.LLM_API_KEY && serverEnv.LLM_API_KEY.length > 0);
}

/** 真实 LLM Adapter 所需配置是否完整。 */
export function hasLlmConfiguration(): boolean {
  return Boolean(
    hasLlmKey() && serverEnv.LLM_BASE_URL && serverEnv.LLM_MODEL,
  );
}

/** 仅判断新闻源密钥是否存在。 */
export function hasNewsApiKey(): boolean {
  return Boolean(serverEnv.NEWS_API_KEY && serverEnv.NEWS_API_KEY.length > 0);
}

/** Supabase 服务端连接是否完整。 */
export function hasSupabaseServerConfig(): boolean {
  return Boolean(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL &&
      serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** 浏览器/SSR Cookie Session 所需的公开配置是否完整。 */
export function hasSupabaseAuthConfig(): boolean {
  return Boolean(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL &&
      serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function hasResendConfiguration(): boolean {
  return Boolean(serverEnv.RESEND_API_KEY && serverEnv.EMAIL_FROM);
}

/** 是否应使用 Mock AI：无密钥或显式 USE_MOCK_AI 时为 true。 */
export function shouldUseMockAi(): boolean {
  if (serverEnv.NODE_ENV === "test") {
    return true;
  }
  if (!hasLlmConfiguration()) {
    return true;
  }
  return serverEnv.USE_MOCK_AI;
}
