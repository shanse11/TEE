# 今日报纸 TodayPaper

基于 Next.js App Router 的 TodayPaper 全栈 MVP。前端页面、可替换 API Adapter，以及新闻搜索、排序去重、结构化 AI、日报/海报领域服务、Memory/Supabase Repository Adapter 和 Route Handlers 均已接通。

完整页面、流程、组件与数据层说明见 [TodayPaper 前端项目说明](./FRONTEND_PROJECT.md)。

## 本地运行

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>。

## 质量检查

```bash
npm run check:frontend
```

该命令依次执行 lint、前端类型检查、前端测试、Demo 数据/Adapter/固定路由校验和生产构建。也可以按需单独执行：

```bash
npm run lint
npm run typecheck:frontend
npm run test:frontend
npm run validate:data
npm run validate:api
npm run validate:demo
npm run build
```

普通产品页默认使用真实 HTTP Route Handler（`NEXT_PUBLIC_USE_MOCK_API=false`）；`/demo/*` 始终读取固定演示数据。复制 `.env.example` 为 `.env.local` 后填写本地配置，不要提交 `.env.local`。

## 后端与 AI

无外部配置时，开发环境使用本地数据集、五家公开新闻首页和本地 Repository；订阅、日报与作品会保存在 Git 忽略的 `.todaypaper/local-state.json`，重启开发服务后仍可恢复。测试使用隔离的 Memory Repository；生产环境仍需配置 Supabase，且不会把本地或 Demo 新闻标记为实时内容。配置 Supabase、新闻源、LLM 和 Resend 后，新闻会持续入库，并由数据库支持跨请求搜索和海报生成。验证命令：

```bash
npm run check:backend
```

需要联调真实 Route Handlers 时，将本地环境中的 `NEXT_PUBLIC_USE_MOCK_API` 设为 `false`。国内模型推荐 DeepSeek V4 Pro：

```text
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-pro
USE_MOCK_AI=false
```

`LLM_API_KEY` 只应写入被 Git 忽略的 `.env.local` 或部署平台 Secret，不能粘贴进源码、文档、日志或提交记录。没有密钥时保持 `USE_MOCK_AI=true`。

新闻候选在开发环境合并 `data/raw/*.json` 打包数据集与已配置的实时 Provider。当前 10 个批次共包含 203 条原始记录；Provider 保留原始 ID，并将跨分类的重复 URL 合并为 164 条唯一候选，同时合并分类关键词和更完整的正文。人民网、新华网、中国新闻网、光明网和科技日报的公开首页 Provider 已内置；今日头条和腾讯新闻仍需通过获得授权的接口、RSS 或 NewsAPI 兼容服务接入。缓存少于 6 条或不足 5 个独立平台时会继续尝试在线来源。`meta.dataMode=cache` 表示结果来自本地/数据库缓存，`live` 表示确实包含实时 Provider，`demo` 表示固定演示降级。

生产部署从 [生产环境配置](./docs/PRODUCTION_SETUP.md) 开始；新闻源见 [新闻 Provider 配置](./docs/NEWS_PROVIDER_SETUP.md)，定时任务和邮件见 [Cron 与邮件配置](./docs/CRON_AND_EMAIL_SETUP.md)。后端接口与兼容规则见 [API 契约](./docs/API_CONTRACT.md)，Supabase 表和索引要求见 [数据库契约](./docs/BACKEND_DATABASE_CONTRACT.md)。

## 生产调用链

新闻搜索：

`Supabase 新鲜缓存 → 实时 NewsAPI/RSS（不足时）→ 规范化/去重 → news_articles upsert → 排序与角度分类 → 搜索/海报`

每日投递：

`Vercel Cron 00:00 UTC → 到期用户 → 幂等 claim → 订阅 topic + keywords → 日报生成与保存 → Resend → delivery_logs`

北京时间日期统一通过 `Asia/Shanghai` 计算。真实用户使用 Supabase Magic Link 和 SSR Cookie Session；普通 API 不信任请求体、查询参数或自定义 Header 中的用户 ID。

## 前后端联调

前端当前需要的数据模型、接口请求/响应、页面调用位置及与后端提示文档的差异，见 [前端数据与 API 契约](./docs/API_CONTRACT.md)。

最终页面、流程、断点与质量检查记录见 [前端验收报告](./docs/FRONTEND_ACCEPTANCE.md)。

固定演示入口：

- `/demo/home`
- `/demo/newspaper`
- `/demo/theme-poster`
- `/demo/topic-poster`

这些页面直接读取 `data/demo` 中的本地 JSON，不依赖登录、浏览器存储或外部服务。
