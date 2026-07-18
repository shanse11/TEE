# TodayPaper 生产环境配置

## 1. Supabase

1. 创建 Supabase 项目。
2. 在 SQL Editor 执行 `supabase/migrations/202607180001_production_backend.sql`，或使用 Supabase CLI 执行 `supabase db push`。
3. 在 Auth URL Configuration 中设置生产 `Site URL`，并允许本地与生产的 `/auth/callback`、`/auth/confirm` 地址。
4. 将公开 URL/Anon Key 配置到 `NEXT_PUBLIC_SUPABASE_*`；Service Role 只配置到服务端 Secret。
5. 若使用 token-hash Magic Link 模板，将链接指向 `/auth/confirm?token_hash={{ .TokenHash }}&type=email`；默认 PKCE code 流使用 `/auth/callback`。

普通页面使用 Supabase SSR Cookie Session。生产环境缺少 Auth 配置或 Session 时会拒绝用户 API，不会回退到演示用户。Service Role 仅供 Repository 和 Cron 使用。

## 2. 外部服务

- 新闻：参考 `docs/NEWS_PROVIDER_SETUP.md`。
- LLM：配置兼容 Chat Completions 的 `LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY`，并设置 `USE_MOCK_AI=false`。
- 邮件和 Cron：参考 `docs/CRON_AND_EMAIL_SETUP.md`。

所有真实密钥只放在 `.env.local` 或部署平台 Secret。`.env.example` 仅保留空值或无效示例。

## 3. 本地运行

```bash
npm install
npm run dev
```

无外部密钥时可将 `NEXT_PUBLIC_USE_MOCK_API=true`、`USE_MOCK_AI=true` 用于开发，或直接访问 `/demo/*`。自动化测试会 Mock 所有外部网络，不要求真实账号。

## 4. 手动端到端验证

1. 访问 `/login`，完成 Magic Link 登录。
2. 在 `/onboarding` 保存订阅主题、关键词和邮箱。
3. 在 `/topic-search` 搜索任意关键词，确认来源、时间、原文链接和数据状态。
4. 选择文章生成专题，刷新页面后确认仍可读取。
5. 在 `/dashboard` 立即生成日报。
6. 使用受保护的 Cron 请求预抓取新闻和触发投递，确认同日只有一个邮件记录。
7. 检查邮件中的摘要、原文链接、完整日报和订阅管理链接。

## 5. 发布前检查

```bash
npm run lint
npm run typecheck
npm run test
npm run validate:data
npm run validate:api
npm run validate:demo
npm run build
```

生产部署不会自动创建 Supabase、新闻 API、Resend 或付费 LLM 资源。
