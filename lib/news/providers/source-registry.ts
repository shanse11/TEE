import { z } from "zod";
import { serverEnv } from "@/lib/config/env";

const rssSourceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().url().refine((value) => value.startsWith("https://"), {
    message: "RSS 地址必须使用 HTTPS",
  }),
  category: z.string().trim().min(1).max(50).default("综合"),
  language: z.string().trim().min(2).max(10).default("zh"),
});

export type RssSource = z.infer<typeof rssSourceSchema>;

/**
 * RSS 地址只从部署配置读取，仓库不猜测或硬编码第三方 Feed。
 * 无效配置视为没有 RSS 源，且不会把原始配置写入日志。
 */
export function getConfiguredRssSources(
  value = serverEnv.NEWS_RSS_SOURCES,
): RssSource[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    const result = rssSourceSchema.array().max(20).safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}
