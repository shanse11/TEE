# 新闻 Provider 配置

## 数据来源

生产搜索顺序为：Supabase 新鲜新闻 → 配置的实时 Provider → 规范化/去重/upsert → 数据库重新查询与排序。

- 公开首页：内置人民网、新华网、中国新闻网、光明网和科技日报五个独立 Provider。只提取标题、官方原文链接和链接中的发布日期，不抓取正文；单个站点失败不会中断其他来源。公开页面至少缓存 120 秒，其中人民网遵守官网 `robots.txt` 的 `Crawl-delay: 120`。
- NewsAPI：配置 `NEWS_API_KEY`；默认兼容 NewsAPI.org `/v2/everything`，也可用 `NEWS_API_BASE_URL` 指定已获授权的兼容端点。`NEWS_API_DOMAINS` 会传给兼容接口的 `domains` 参数。
- RSS：通过 `NEWS_RSS_SOURCES` 配置经过确认的官方 HTTPS Feed。
- 本地 `data/raw`：只在开发、测试、离线演示或故障排查中启用。

如需通过获得授权的 NewsAPI 兼容服务补充今日头条、腾讯新闻等平台，可配置域名过滤：

```text
NEWS_API_DOMAINS=toutiao.com,qq.com
```

这项配置只在 `NEWS_API_KEY` 存在时生效。当前今日头条创作者平台和腾讯内容开放平台公开展示的能力主要用于合作方向平台同步/发布内容，不是无需授权的新闻读取 API。腾讯开发者中心还显示相关注册或申请暂停维护。因此，TodayPaper 不调用网页内部搜索接口，也不会绕过登录或反爬限制；如需把今日头条、腾讯新闻标记为实时平台，必须配置平台授权接口、获得许可的 RSS，或能返回对应原文域名的合规 NewsAPI 兼容服务。

下面只展示配置结构，不代表真实可用源：

```text
NEWS_RSS_SOURCES=[{"name":"官方来源","url":"https://invalid.example/feed.xml","category":"科技","language":"zh"}]
```

请从来源机构官网确认 RSS/API 地址和使用条款；不要猜测 Feed、绕过登录、抓取禁止页面或保存未获授权的完整正文。

## 限制与可靠性

- Provider 超时由 `NEWS_PROVIDER_TIMEOUT_MS` 控制，最大 15 秒。
- 响应体最大 1 MB，所有 JSON/XML 都先校验和规范化。
- 429、超时和 5xx 只做有限重试；参数错误不重试。
- 单个 Provider 失败不会中断其他 Provider。
- `NEWS_CACHE_TTL_SECONDS` 默认 600 秒；新鲜数据不足 6 条或覆盖少于 5 个独立平台时会继续触发实时获取。
- `NEWS_INGEST_QUERIES` 可配置 Cron 公共新闻池主题（逗号分隔）。

日志只记录 Provider 名称、状态、耗时和数量，不记录 API Key、正文或原始供应商响应。

## 数据状态

- `live`：实时 Provider 成功；
- `cache`：数据库中的新鲜新闻；
- `degraded`：实时源失败或未配置，结果可能来自旧缓存；
- `demo`：固定演示/开发数据，绝不冒充实时新闻。
