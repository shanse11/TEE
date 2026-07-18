import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  BookOpenText,
  Eye,
  FileText,
  Layers3,
  Radio,
  Sparkles,
} from "lucide-react";
import Image from "next/image";

import { SourceMeta } from "@/components/news/source-meta";
import { NewspaperMasthead } from "@/components/newspaper/newspaper-masthead";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DailyIssue, NewsArticle } from "@/types";

function formatPublishedAt(value: string) {
  return format(parseISO(value), "MM-dd HH:mm", { locale: zhCN });
}

function findLeadArticle(issue: DailyIssue): NewsArticle | undefined {
  return issue.sections
    .flatMap((section) => section.articles)
    .find((article) => article.id === issue.leadArticleId);
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s，。！？；：、“”‘’《》【】（）()·|｜—-]/g, "");
}

function meaningfulDescription(article: NewsArticle): string | null {
  const description = article.description.trim();
  if (!description) return null;
  const titleKey = normalizeText(article.title);
  const descriptionKey = normalizeText(description);
  if (
    descriptionKey === titleKey ||
    (titleKey.length > 0 && descriptionKey.length <= titleKey.length + 4)
  ) {
    return null;
  }
  return description;
}

function briefingPoints(value: string): string[] {
  return (
    value
      .match(/[^。！？；]+[。！？；]?/g)
      ?.map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4) ?? [value]
  );
}

function sectionGridClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "lg:grid-cols-2";
  return "lg:grid-cols-3";
}

export function DailyNewspaper({
  issue,
  demoMode = false,
}: {
  issue: DailyIssue;
  demoMode?: boolean;
}) {
  const leadArticle = findLeadArticle(issue);
  const issueDateLabel = format(
    parseISO(issue.issueDate),
    "yyyy 年 M 月 d 日 EEEE",
    { locale: zhCN },
  );
  const issueNumber = issue.issueDate.replaceAll("-", "");
  const articles = Array.from(
    new Map(
      issue.sections
        .flatMap((section) => section.articles)
        .map((article) => [article.id, article]),
    ).values(),
  );
  const sourceNames = Array.from(
    new Set(articles.map((article) => article.source)),
  );
  const highlights = new Map(
    (issue.articleHighlights ?? []).map((item) => [
      item.articleId,
      item,
    ]),
  );
  const leadSummary = leadArticle
    ? (highlights.get(leadArticle.id)?.takeaway ??
      meaningfulDescription(leadArticle))
    : null;
  const briefing = briefingPoints(issue.dailyBriefing);

  return (
    <article className="newspaper-sheet paper-grain border border-line-strong bg-surface p-4 shadow-paper sm:p-7 lg:p-9">
      <NewspaperMasthead
        issueDate={issueDateLabel}
        issueNumber={issueNumber}
        topics={issue.topics}
        demoMode={demoMode}
      />

      <section className="newspaper-block mt-6 overflow-hidden rounded-lg border border-line-strong bg-paper">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-2 text-brand">
              <Sparkles className="size-5" aria-hidden="true" />
              <h1 className="font-serif text-2xl font-semibold">
                30 秒读懂今天
              </h1>
            </div>
            <p className="mt-3 max-w-4xl font-serif text-lg leading-8 text-ink">
              {briefing[0]}
            </p>
            {briefing.length > 1 && (
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {briefing.slice(1).map((item, index) => (
                <div
                  key={`${index}-${item}`}
                  className="flex gap-3 rounded-md border border-line bg-surface/80 p-3"
                >
                  <span className="font-brand grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs text-white">
                    {index + 2}
                  </span>
                  <p className="text-xs leading-5 text-muted-ink">{item}</p>
                </div>
                ))}
              </div>
            )}
          </div>
          <aside className="grid grid-cols-3 border-t border-line bg-surface lg:grid-cols-1 lg:border-t-0 lg:border-l">
            {[
              {
                icon: Layers3,
                value: issue.topics.length,
                label: "关注方向",
              },
              {
                icon: FileText,
                value: articles.length,
                label: "精选报道",
              },
              {
                icon: Radio,
                value: sourceNames.length,
                label: "新闻来源",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-center gap-3 border-r border-line p-4 last:border-r-0 lg:justify-start lg:border-r-0 lg:border-b lg:last:border-b-0"
              >
                <item.icon
                  className="hidden size-5 text-brand sm:block"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-serif text-2xl font-semibold">
                    {item.value}
                  </p>
                  <p className="text-[0.68rem] text-muted-ink">{item.label}</p>
                </div>
              </div>
            ))}
          </aside>
        </div>
      </section>

      {leadArticle && (
        <section className="newspaper-block mt-6 overflow-hidden rounded-lg border-2 border-ink bg-surface">
          <div
            className={cn(
              "grid",
              leadArticle.imageUrl &&
                "lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]",
            )}
          >
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>今日头条</Badge>
                <span className="text-xs font-medium tracking-[0.16em] text-muted-ink uppercase">
                  最值得先看
                </span>
              </div>
              <h2 className="mt-4 max-w-4xl font-serif text-3xl font-bold leading-tight sm:text-4xl">
                {highlights.get(leadArticle.id)?.headline ?? leadArticle.title}
              </h2>
              {leadSummary && (
                <div className="mt-5 border-l-4 border-brand bg-paper px-4 py-3">
                  <p className="mb-1 text-xs font-semibold text-brand">
                    一句话看懂
                  </p>
                  <p className="text-sm leading-6 text-ink">{leadSummary}</p>
                </div>
              )}
              <SourceMeta
                className="mt-5"
                source={leadArticle.source}
                sourceUrl={leadArticle.sourceUrl}
                publishedLabel={formatPublishedAt(leadArticle.publishedAt)}
              />
            </div>
            {leadArticle.imageUrl && (
              <div className="relative min-h-64 border-t border-line bg-soft lg:border-t-0 lg:border-l">
                <Image
                  src={leadArticle.imageUrl}
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 42vw"
                  className="object-cover"
                />
              </div>
            )}
          </div>
        </section>
      )}

      <section className="newspaper-block mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">
              Topic Briefs
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold">
              按关注方向阅读
            </h2>
          </div>
          <p className="text-xs text-muted-ink">
            已按重要性整理，头条不重复展示
          </p>
        </div>

        <div
          className={cn(
            "mt-5 grid gap-5",
            sectionGridClass(issue.sections.length),
          )}
        >
          {issue.sections.map((section, sectionIndex) => {
            const sectionArticles = section.articles.filter(
              (article) => article.id !== leadArticle?.id,
            );
            return (
              <section
                key={section.title}
                className="rounded-lg border border-line-strong bg-surface p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-brand text-xs text-brand">
                      0{sectionIndex + 1}
                    </p>
                    <h3 className="mt-1 font-serif text-2xl font-semibold">
                      {section.title}
                    </h3>
                  </div>
                  <Badge variant="neutral">
                    {section.articles.length} 篇
                  </Badge>
                </div>

                {section.summary && (
                  <div className="mt-4 rounded-md bg-paper p-3">
                    <p className="flex items-center gap-2 text-xs font-semibold text-brand">
                      <Eye className="size-4" aria-hidden="true" />
                      今日观察
                    </p>
                    <p className="mt-2 text-sm leading-6 text-ink">
                      {section.summary}
                    </p>
                  </div>
                )}

                {sectionArticles.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {sectionArticles.map((article, articleIndex) => {
                      const highlight = highlights.get(article.id);
                      const summary =
                        highlight?.takeaway ??
                        meaningfulDescription(article);
                      return (
                        <article
                          key={article.id}
                          className="rounded-md border border-line bg-paper/55 p-4"
                        >
                          <div className="flex items-start gap-3">
                            <span className="font-brand grid size-7 shrink-0 place-items-center rounded-full border border-brand/30 text-xs text-brand">
                              {articleIndex + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="mb-2 flex flex-wrap gap-2">
                                <Badge variant="neutral">
                                  {article.category}
                                </Badge>
                              </div>
                              <h4 className="font-serif text-lg font-semibold leading-snug">
                                {highlight?.headline ?? article.title}
                              </h4>
                              {summary && (
                                <p className="mt-2 text-sm leading-6 text-muted-ink">
                                  {summary}
                                </p>
                              )}
                              <SourceMeta
                                className="mt-3"
                                source={article.source}
                                sourceUrl={article.sourceUrl}
                                publishedLabel={formatPublishedAt(
                                  article.publishedAt,
                                )}
                              />
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-4 rounded-md border border-dashed border-line p-3 text-xs text-muted-ink">
                    本栏最重要的报道已在“今日头条”中展开。
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </section>

      <div className="mt-8 grid gap-5 border-t-2 border-ink pt-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="newspaper-block rounded-lg border border-line-strong bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpenText className="size-5 text-brand" aria-hidden="true" />
              <h2 className="font-serif text-xl font-semibold">今日速读</h2>
            </div>
            <span className="text-xs text-muted-ink">
              {issue.quickNews.length} 条
            </span>
          </div>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2">
            {issue.quickNews.map((item, index) => (
              <li
                key={item}
                className="flex gap-3 rounded-md border border-line bg-paper/60 p-3"
              >
                <span className="font-brand text-xs text-brand">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm leading-6 text-ink">{item}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="newspaper-block rounded-lg border border-brand/25 bg-brand/5 p-5">
          <div className="flex items-center gap-2 text-brand">
            <Radio className="size-5" aria-hidden="true" />
            <h2 className="font-serif text-xl font-semibold">接下来关注</h2>
          </div>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-ink">
            {issue.watchNext.map((item, index) => (
              <li key={item} className="flex gap-3">
                <span className="font-brand grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs text-white">
                  {index + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="newspaper-block mt-8 border-t border-line pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg font-semibold">原文与来源</h2>
          <span className="text-xs text-muted-ink">
            共 {articles.length} 篇 · {sourceNames.length} 个来源
          </span>
        </div>
        <ol className="mt-3 grid gap-2 text-xs leading-5 sm:grid-cols-2">
          {articles.map((article, index) => (
            <li
              key={article.id}
              className="flex gap-3 rounded-md border border-line bg-paper/45 p-3"
            >
              <span className="font-brand text-brand">{index + 1}.</span>
              <div className="min-w-0">
                <p className="line-clamp-1 font-medium text-ink">
                  {highlights.get(article.id)?.headline ?? article.title}
                </p>
                <p className="mt-1 text-muted-ink">
                  {article.source} · {formatPublishedAt(article.publishedAt)}
                  {article.sourceUrl && (
                    <>
                      {" · "}
                      <a
                        href={article.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand hover:underline"
                      >
                        查看原文
                      </a>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-5 border-t border-line pt-4 text-center text-[0.68rem] tracking-[0.12em] text-muted-ink">
          {demoMode
            ? "本期内容为 TodayPaper 固定演示数据，不代表实时新闻"
            : "新闻版权归原作者与来源机构所有，请以原文为准"}
        </p>
      </section>
    </article>
  );
}
