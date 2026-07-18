# Cron 与邮件配置

## Resend

1. 在 Resend 验证发件域名。
2. 将 API Key 配置为服务端 `RESEND_API_KEY`。
3. 将已验证发件人配置为 `EMAIL_FROM`。
4. 确保 `NEXT_PUBLIC_APP_URL` 是用户可访问的 HTTPS 地址。

邮件同时发送 HTML 和纯文本，只包含摘要、主要新闻、原文链接、完整日报链接和订阅管理链接。幂等键为 `email:{userId}:{issueDate}`；数据库还以 `delivery_logs.idempotency_key` 和 `(issue_id, channel)` 双重防重。失败只记录 `EMAIL_SEND_FAILED`，不会删除已生成日报。

## Vercel Cron

`vercel.json` 定义：

- `/api/cron/news-ingest`：Hobby 部署为每天 UTC 23:30（北京时间 07:30）预抓取；
- `/api/cron/daily-delivery`：`0 0 * * *`，即北京时间 08:00。

在 Vercel Secret 中配置高熵 `CRON_SECRET`。Vercel 会发送 `Authorization: Bearer <CRON_SECRET>`。Route 使用固定长度摘要和常量时间比较；缺少或错误 Secret 会返回 401，响应不包含邮箱、正文或凭据。每次日报任务最多处理 20 个用户，后续可把相同 Repository/EmailSender 边界迁移到 Supabase Cron 或队列。

当前 Hobby 部署使用 UTC 23:30（北京时间 07:30）预抓取，再保留 UTC 00:00 日报任务。升级到支持更高频 Cron 的套餐后，可将新闻预抓取恢复为 `*/15 * * * *`。

## 本地验证

测试不需要 Resend 或 Cron Secret，所有外部请求均 Mock。手动请求时只从本地 Secret 注入 Authorization，不要把 Secret 写入命令历史、文档、截图或日志。
