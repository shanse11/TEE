# TodayPaper API 契约

## 生产身份与响应元数据

- 普通 Route Handler 从 Supabase SSR Cookie Session 获取用户 ID。客户端发送的 `userId` 仅为旧版兼容字段，不作为授权依据。
- `/demo/*` 不调用真实写接口。
- 所有响应继续保持 `{ data, meta }`；生成接口可在 `meta` 增加 `aiMode`（`live/mock/fallback`）、`degraded` 和 `persisted`。
- `dataMode` 分为 `live`（本次包含实时新数据）、`cache`（数据库新鲜新闻）、`degraded`（实时源不可用）和 `demo`（固定演示或开发测试）。

搜索响应的 `data` 兼容原有字段，并增加可选 `dataMode`、`freshness`。搜索结果 ID 是 canonical URL 的稳定哈希，可跨请求用于专题生成。

运维接口 `GET /api/cron/news-ingest` 和 `GET /api/cron/daily-delivery` 只接受 `Authorization: Bearer <CRON_SECRET>`，响应只包含安全统计。

> 状态：后端 Route Handlers 与前端 `HttpClient` 已对齐
> 最后核对：2026-07-18

## 1. 通用约定

所有时间均使用 UTC ISO-8601；日期使用 `YYYY-MM-DD`。公开成功响应统一为：

```json
{
  "data": {},
  "meta": {
    "requestId": "UUID",
    "dataMode": "live",
    "generatedAt": "2026-07-18T06:00:00.000Z",
    "persisted": true
  }
}
```

`dataMode`：

- `live`：真实新闻源或数据库；
- `cache`：`data/raw` 本地新闻数据集、60 秒短时查询缓存或已有日报；
- `demo`：Demo Provider、Mock AI 或固定降级数据。

`persisted=false` 表示结果可以展示和下载，但没有跨进程持久化。前端 `lib/api/http-client.ts` 同时兼容统一 envelope 和旧测试中的裸数据。

错误响应：

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "请输入有效的搜索关键词。",
    "retryable": false,
    "requestId": "UUID"
  }
}
```

响应不会包含堆栈、SQL、供应商原始响应、Authorization、Cookie、API Key 或完整新闻正文。

## 2. 核心数据模型

共享冻结类型位于 `types/index.ts`，运行时 Schema 位于 `lib/api/schemas.ts`。

### NewsArticle

```ts
interface NewsArticle {
  id: string;
  title: string;
  description: string;
  content?: string;
  source: string;
  sourceUrl?: string;
  publishedAt: string;
  category: string;
  imageUrl?: string;
  keywords: string[];
  relevanceScore?: number;
}
```

搜索候选额外带有：

```ts
angle: "政策" | "技术" | "产业" | "应用" | "市场";
```

### DailyIssue

```ts
interface DailyIssue {
  id: string;
  userId: string;
  issueDate: string;
  newspaperName: string;
  topics: string[];
  leadArticleId: string;
  dailyBriefing: string;
  sections: {
    title: string;
    articles: NewsArticle[];
  }[];
  quickNews: string[];
  watchNext: string[];
  createdAt: string;
}
```

`leadArticleId` 必须存在于某个栏目中。同一 `userId + issueDate` 幂等。

### ThemePosterContent

主题海报沿用前端已经冻结的独立类型，而不是误用专题类型：

```ts
interface ThemePosterContent {
  id: string;
  theme: string;
  title: string;
  introduction: string;
  articles: NewsArticle[];
  trendSummary: string;
  keywords: string[];
  template: "classic" | "modern";
  createdAt: string;
}
```

### TopicPosterContent

```ts
interface TopicPosterContent {
  id: string;
  keyword: string;
  topicTitle: string;
  introduction: string;
  articles: {
    id: string;
    headline: string;
    summary: string;
    angle: "政策" | "技术" | "产业" | "应用" | "市场";
    source: string;
    sourceUrl?: string;
    publishedAt: string;
    imageUrl?: string;
    relevanceScore: number;
  }[];
  trendSummary: string;
  keyTakeaways: string[];
  keywords: string[];
  template: "classic" | "modern";
  createdAt: string;
}
```

## 3. 接口清单

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/news/search` | 搜索、排序、去重并标注角度 |
| POST | `/api/news/rank` | 对调用方提供的文章排序与去重 |
| POST | `/api/daily-issue/generate` | 幂等生成日报 |
| POST | `/api/theme-poster/generate` | 生成主题海报 |
| POST | `/api/topic-poster/generate` | 按用户选择顺序生成专题 |
| GET/POST | `/api/subscriptions` | 查询、全量保存或新增订阅 |
| PATCH/DELETE | `/api/subscriptions/:id` | 修改或删除单条订阅 |
| GET | `/api/daily-issues` | 分页查询历史日报 |
| GET | `/api/creations` | 筛选历史作品 |
| POST | `/api/creations/save` | 幂等保存作品 |
| GET | `/api/theme-posters/:id` | 查询主题海报 |
| GET | `/api/topic-posters/:id` | 查询专题海报 |
| POST | `/api/delivery/simulate` | 幂等模拟日报投递 |

所有 POST/PATCH 请求必须使用 `Content-Type: application/json`，Body 上限 64 KiB。写接口使用进程内基础限流 Adapter。

## 4. 新闻接口

### GET `/api/news/search`

正式参数：

```http
GET /api/news/search?q=人工智能教育&range=7d&limit=20
```

为兼容现有前端，也接受 `keyword`/`timeRange`。约束：

- `q`：1～100 字符；
- `range`：`24h | 7d | 30d`，默认 `7d`；
- `limit`：1～50，默认 20。

`data`：

```json
{
  "query": "人工智能教育",
  "timeRange": "7d",
  "items": [],
  "articles": [],
  "total": 0
}
```

`items` 是前端冻结字段，`articles` 是后端文档字段，两者内容一致。非生产环境设置 `DEBUG_NEWS_SCORES=true` 时，`articles[]` 额外返回 `scoreBreakdown`。

### POST `/api/news/rank`

请求：

```json
{
  "keyword": "人工智能教育",
  "articles": [],
  "limit": 4,
  "diversify": true
}
```

- `articles`：1～50 篇合法 `NewsArticle`；
- `limit`：3～20；
- 返回 `items`、兼容别名 `articles` 和 `total`。

## 5. 生成接口

### POST `/api/daily-issue/generate`

```json
{
  "userId": "demo-user",
  "issueDate": "2026-07-18",
  "topics": ["人工智能", "科技数码", "商业财经"],
  "forceRefresh": false
}
```

返回 `data: DailyIssue`。`meta.status` 为 `completed` 或 `existing`。同一天重复请求直接返回已有日报；生成中返回 `409 GENERATION_IN_PROGRESS`。

### POST `/api/theme-poster/generate`

```json
{
  "theme": "人工智能",
  "articleCount": 4,
  "summaryLength": "standard",
  "template": "classic"
}
```

返回 `data: ThemePosterContent`。新闻不足时从 7 天扩大到 30 天，再回退演示数据。

### POST `/api/topic-poster/generate`

正式字段和前端兼容字段均可使用：

```json
{
  "keyword": "人工智能教育",
  "selectedArticleIds": [
    "demo-news-policy-01",
    "demo-news-tech-01",
    "demo-news-industry-01"
  ],
  "template": "classic"
}
```

也接受 `articleIds`。要求：

- ID 不能重复；
- 数量为 3～5；
- 每个 ID 必须来自当前候选集合或 Repository；
- 返回文章顺序严格保持请求顺序；
- 来源、URL、时间、图片和相关度由原始文章覆盖，不能由 AI 创建。

## 6. 订阅与历史

### GET `/api/subscriptions`

返回 `SubscriptionBundle`。

### POST `/api/subscriptions`

支持两种兼容模式：

1. 前端全量保存：提交 `subscriptions + deliverySettings`，返回完整 `SubscriptionBundle`；
2. 后端单条新增：提交 `topic + keywords + enabled`，HTTP 201 返回新增 `Subscription`。

### PATCH/DELETE `/api/subscriptions/:id`

PATCH 可修改 `topic`、`keywords`、`enabled` 中至少一项。DELETE 返回：

```json
{ "deleted": true, "id": "subscription-id" }
```

### GET `/api/daily-issues`

Query：`page` 默认 1；`limit` 默认 20、最大 50。`data` 保持为 `DailyIssue[]` 以兼容前端；分页信息位于 `meta.page/limit/total`。

### GET `/api/creations`

兼容筛选：

- `type=all|daily_issue|theme_poster|topic_poster`
- `keyword` 或 `query`
- `dateFrom` / `dateTo`
- `offset` / `limit`

返回 `CreationListResponse`。

### POST `/api/creations/save`

请求 `{ "href": "/theme-poster/id" }`，返回保存后的 `Creation`。重复保存不新增记录。

## 7. 模拟投递

### POST `/api/delivery/simulate`

```json
{
  "userId": "demo-user",
  "issueDate": "2026-07-18"
}
```

返回 `DeliveryResult`。接口只模拟生成和记录，不发送真实邮件，因此默认：

```json
{
  "emailSent": false,
  "status": "partial",
  "message": "日报模拟生成完成；演示接口不会发送真实邮件。"
}
```

`idempotency_key=userId+issueDate` 防止重复模拟记录。

## 8. 身份与安全

当前未接入登录 Session，MVP Route Handler 只接受服务端配置的 `DEMO_USER_ID`，默认 `demo-user`。任意其他 Body/Query 用户 ID 返回 `401 UNAUTHORIZED`，不会直接用于数据库查询。

生产登录接入后，应将 `resolveUserId` 替换为服务端 Session 解析，并在 Supabase 开启 RLS。

错误码：

```text
INVALID_INPUT
UNAUTHORIZED
NOT_FOUND
CONFLICT
DAILY_ISSUE_EXISTS
GENERATION_IN_PROGRESS
NEWS_PROVIDER_UNAVAILABLE
INSUFFICIENT_ARTICLES
AI_UNAVAILABLE
AI_INVALID_OUTPUT
DATABASE_UNAVAILABLE
RATE_LIMITED
INTERNAL_ERROR
```

## 9. 降级链路

```text
新闻：LocalDatasetNewsProvider + GenericNewsApiProvider → Composite Provider → DemoNewsProvider
AI：OpenAI-compatible Client → 一次重试 → 确定性模板
数据：SupabaseRepository → 生成结果 persisted=false / 开发期 MemoryRepository
```

默认测试环境完全离线，读取打包的 `data/raw` 数据集，不访问新闻、DeepSeek、Supabase 或邮件服务；即使本机 `.env.local` 已配置真实密钥，测试环境仍强制使用 Mock AI 并禁用外部新闻 Provider。

## 10. 验证

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

接口集成测试位于 `tests/backend/api-routes.test.ts`，覆盖搜索、三种生成、重复模拟投递和错误脱敏。
