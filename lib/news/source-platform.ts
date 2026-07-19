import type { NewsArticle } from "@/types";

export function newsPlatform(article: NewsArticle): string {
  if (article.sourceUrl) {
    try {
      const hostname = new URL(article.sourceUrl).hostname
        .toLocaleLowerCase("en-US")
        .replace(/^www\./, "");
      if (
        hostname === "people.cn" ||
        hostname.endsWith(".people.cn") ||
        hostname === "people.com.cn" ||
        hostname.endsWith(".people.com.cn")
      ) {
        return "人民网";
      }
      if (
        hostname === "news.cn" ||
        hostname.endsWith(".news.cn") ||
        hostname === "xinhuanet.com" ||
        hostname.endsWith(".xinhuanet.com")
      ) {
        return "新华网";
      }
      if (
        hostname === "chinanews.com.cn" ||
        hostname.endsWith(".chinanews.com.cn")
      ) {
        return "中国新闻网";
      }
      if (hostname === "gmw.cn" || hostname.endsWith(".gmw.cn")) {
        return "光明网";
      }
      if (
        hostname === "stdaily.com" ||
        hostname.endsWith(".stdaily.com")
      ) {
        return "科技日报";
      }
      if (hostname === "toutiao.com" || hostname.endsWith(".toutiao.com")) {
        return "今日头条";
      }
      if (hostname === "qq.com" || hostname.endsWith(".qq.com")) {
        return "腾讯新闻";
      }
      return hostname;
    } catch {
      // URL 异常时退回来源名。
    }
  }
  return article.source.trim();
}

export function distinctNewsPlatforms(articles: NewsArticle[]): string[] {
  return Array.from(new Set(articles.map(newsPlatform).filter(Boolean)));
}
