# TodayPaper 后端数据库契约

> 面向部署成员。应用在无 Supabase 时使用进程内 Memory Repository；生产写操作必须配置持久化数据库，并根据 API `meta.persisted` 向用户反馈保存状态。

## 必要环境变量

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` 只能在服务端和部署平台 Secret 中配置，禁止使用 `NEXT_PUBLIC_` 前缀。

完整可执行迁移位于 `supabase/migrations/202607180001_production_backend.sql`。可在 Supabase SQL Editor 执行，或使用 Supabase CLI 的 `supabase db push`；迁移创建产品表、新闻表、唯一索引、全文索引和 RLS policy。

## 表与约束

### news_articles

公共新闻池，以 `id` 为稳定主键、`canonical_url` 唯一。保存 Provider、来源、标题、摘要、允许保存的正文摘录、图片、分类、关键词、发布时间、抓取时间、内容哈希和安全元数据。

### news_fetch_runs

记录每个 Provider/查询的运行状态、抓取数量、安全错误码和开始/结束时间，不保存密钥、原始响应或正文。

### subscriptions

| 字段 | 建议类型 | 约束 |
|---|---|---|
| id | text/uuid | PRIMARY KEY |
| user_id | text/uuid | NOT NULL |
| topic | text | NOT NULL |
| keywords | jsonb | NOT NULL DEFAULT `[]` |
| enabled | boolean | NOT NULL DEFAULT true |
| today_update_count | integer | NOT NULL DEFAULT 0 |
| created_at | timestamptz | NOT NULL |
| updated_at | timestamptz | NOT NULL |

建议唯一索引：`UNIQUE(user_id, topic)`。

### delivery_settings

| 字段 | 建议类型 | 约束 |
|---|---|---|
| user_id | text/uuid | PRIMARY KEY |
| delivery_enabled | boolean | NOT NULL DEFAULT false |
| delivery_time | time | NOT NULL DEFAULT `08:00` |
| email | text | 可空 |
| email_enabled | boolean | NOT NULL DEFAULT false |

### daily_issues

| 字段 | 建议类型 | 约束 |
|---|---|---|
| id | uuid | PRIMARY KEY，可由数据库生成 |
| user_id | text/uuid | NOT NULL |
| issue_date | date | NOT NULL |
| topics | jsonb | NOT NULL DEFAULT `[]` |
| content_json | jsonb | 可空，完成后写入 `DailyIssue` |
| generation_status | text | `processing/completed/failed` |
| error_code | text | 可空，只保存安全错误码 |
| created_at | timestamptz | NOT NULL |
| updated_at | timestamptz | NOT NULL |

强制约束：

```sql
CREATE UNIQUE INDEX daily_issues_user_date_uidx
ON daily_issues (user_id, issue_date);
```

该唯一索引是防止定时任务、模拟投递或重试并发生成多份日报的最终保障。

### theme_posters

| 字段 | 建议类型 |
|---|---|
| id | text PRIMARY KEY |
| user_id | text/uuid NOT NULL |
| theme | text NOT NULL |
| article_ids | jsonb NOT NULL |
| content_json | jsonb NOT NULL |
| template | text NOT NULL |
| created_at | timestamptz NOT NULL |

### topic_posters

| 字段 | 建议类型 |
|---|---|
| id | text PRIMARY KEY |
| user_id | text/uuid NOT NULL |
| keyword | text NOT NULL |
| article_ids | jsonb NOT NULL |
| content_json | jsonb NOT NULL |
| template | text NOT NULL |
| created_at | timestamptz NOT NULL |

`article_ids` 必须按用户选择顺序保存。

### creations

| 字段 | 建议类型 |
|---|---|
| id | text PRIMARY KEY |
| user_id | text/uuid NOT NULL |
| type | text NOT NULL |
| title | text NOT NULL |
| description | text NOT NULL |
| cover_image_url | text NOT NULL |
| href | text NOT NULL |
| saved | boolean NOT NULL DEFAULT false |
| created_at | timestamptz NOT NULL |

建议唯一索引：`UNIQUE(user_id, href)`，保证“保存作品”幂等。

### delivery_logs

| 字段 | 建议类型 |
|---|---|
| id | text PRIMARY KEY |
| user_id | text/uuid NOT NULL |
| issue_id | text NOT NULL |
| channel | text NOT NULL |
| status | text NOT NULL |
| error_message | text |
| sent_at | timestamptz |
| idempotency_key | text NOT NULL UNIQUE |

`error_message` 只能保存安全摘要，不能写入邮箱全文、Authorization、Cookie、供应商响应或新闻正文。

## 安全与 RLS

- 浏览器只能使用 Supabase Anon Key；Service Role Key 仅由 Route Handler 的服务端 Repository 使用。
- 用户表已启用 RLS，并以 `auth.uid()::text = user_id::text` 约束读写。
- `news_articles` 允许已登录用户只读；`news_fetch_runs` 没有浏览器 policy。
- Route Handler 不信任 Query、Body 或自定义 Header 中的任意用户 ID。
- 数据库错误统一转换为 `DATABASE_UNAVAILABLE`，不会返回 SQL、表结构或原始记录。

## Repository 切换

- 两个 Supabase 环境变量均存在：使用 `SupabaseRepository`。
- 任一缺失：使用 `MemoryRepository`，API 返回 `meta.persisted=false`。
- Memory 数据不跨进程、重启或 Serverless 实例持久化，只适合开发和演示。
