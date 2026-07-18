import type { DailyIssue } from "@/types";

export interface DailyIssueEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

export function renderDailyIssueEmail(input: {
  issue: DailyIssue;
  appUrl: string;
}): DailyIssueEmail {
  const appUrl = input.appUrl.replace(/\/$/, "");
  const issueUrl = `${appUrl}/newspaper/${encodeURIComponent(input.issue.id)}`;
  const manageUrl = `${appUrl}/subscriptions`;
  const leadArticles = input.issue.sections
    .flatMap((section) => section.articles)
    .slice(0, 6);
  const subject = `${input.issue.issueDate}｜${input.issue.newspaperName}`;
  const articleHtml = leadArticles
    .map(
      (article) => `
        <article style="margin:20px 0">
          <h2 style="font-size:18px">${escapeHtml(article.title)}</h2>
          <p>${escapeHtml(article.description)}</p>
          <p style="color:#6d685f;font-size:13px">${escapeHtml(article.source)} · ${escapeHtml(article.publishedAt)}</p>
          ${
            article.sourceUrl
              ? `<a href="${escapeHtml(article.sourceUrl)}">查看原文</a>`
              : ""
          }
        </article>`,
    )
    .join("");
  const html = `<!doctype html>
    <html lang="zh-CN">
      <body style="font-family:system-ui,sans-serif;color:#24211d">
        <main style="max-width:640px;margin:0 auto;padding:24px">
          <p style="color:#c52026;letter-spacing:.18em">TODAYPAPER</p>
          <h1>${escapeHtml(subject)}</h1>
          <p>${escapeHtml(input.issue.dailyBriefing)}</p>
          <hr />
          ${articleHtml}
          <p>
            <a href="${escapeHtml(issueUrl)}">打开完整日报</a> ·
            <a href="${escapeHtml(manageUrl)}">管理订阅或关闭投递</a>
          </p>
        </main>
      </body>
    </html>`;
  const text = [
    subject,
    "",
    input.issue.dailyBriefing,
    "",
    ...leadArticles.flatMap((article) => [
      article.title,
      `${article.source} · ${article.publishedAt}`,
      article.description,
      article.sourceUrl ?? "",
      "",
    ]),
    `完整日报：${issueUrl}`,
    `管理订阅或关闭投递：${manageUrl}`,
  ].join("\n");
  return { subject, html, text };
}
