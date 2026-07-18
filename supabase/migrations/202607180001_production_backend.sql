begin;

create extension if not exists pgcrypto;

create table if not exists public.news_articles (
  id text primary key,
  canonical_url text not null,
  provider text not null,
  source text not null,
  title text not null,
  description text not null,
  content_excerpt text,
  image_url text,
  category text not null default '综合',
  keywords jsonb not null default '[]'::jsonb,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  content_hash text not null,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_articles_canonical_url_key unique (canonical_url),
  constraint news_articles_keywords_array check (jsonb_typeof(keywords) = 'array'),
  constraint news_articles_raw_metadata_object check (jsonb_typeof(raw_metadata) = 'object')
);

create index if not exists news_articles_published_at_idx
  on public.news_articles (published_at desc);
create index if not exists news_articles_category_published_at_idx
  on public.news_articles (category, published_at desc);
create index if not exists news_articles_keywords_gin_idx
  on public.news_articles using gin (keywords);
create index if not exists news_articles_search_idx
  on public.news_articles using gin (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  );

create table if not exists public.news_fetch_runs (
  id text primary key,
  provider text not null,
  query text not null default '',
  status text not null check (status in ('running', 'completed', 'partial', 'failed')),
  fetched_count integer not null default 0 check (fetched_count >= 0),
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists news_fetch_runs_started_at_idx
  on public.news_fetch_runs (started_at desc);
create index if not exists news_fetch_runs_provider_started_at_idx
  on public.news_fetch_runs (provider, started_at desc);

create table if not exists public.subscriptions (
  id text primary key,
  user_id text not null,
  topic text not null,
  keywords jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  today_update_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_settings (
  user_id text primary key,
  delivery_enabled boolean not null default false,
  delivery_time time not null default '08:00',
  email text,
  email_enabled boolean not null default false
);

create table if not exists public.daily_issues (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  issue_date date not null,
  topics jsonb not null default '[]'::jsonb,
  content_json jsonb,
  generation_status text not null
    check (generation_status in ('processing', 'completed', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.theme_posters (
  id text primary key,
  user_id text not null,
  theme text not null,
  article_ids jsonb not null,
  content_json jsonb not null,
  template text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.topic_posters (
  id text primary key,
  user_id text not null,
  keyword text not null,
  article_ids jsonb not null,
  content_json jsonb not null,
  template text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.creations (
  id text primary key,
  user_id text not null,
  type text not null,
  title text not null,
  description text not null,
  cover_image_url text not null,
  href text not null,
  saved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_logs (
  id text primary key,
  user_id text not null,
  issue_id text not null,
  channel text not null check (channel in ('email', 'simulation')),
  status text not null check (status in ('pending', 'sent', 'failed', 'simulated')),
  error_message text,
  sent_at timestamptz,
  idempotency_key text not null
);

-- Existing product tables can predate this migration. These indexes are
-- idempotent and are the final concurrency guard for serverless workers.
create unique index if not exists daily_issues_user_date_uidx
  on public.daily_issues (user_id, issue_date);
create unique index if not exists delivery_logs_idempotency_uidx
  on public.delivery_logs (idempotency_key);
create unique index if not exists delivery_logs_issue_channel_uidx
  on public.delivery_logs (issue_id, channel);
create unique index if not exists creations_user_href_uidx
  on public.creations (user_id, href);
create unique index if not exists subscriptions_user_topic_uidx
  on public.subscriptions (user_id, topic);

alter table public.subscriptions enable row level security;
alter table public.delivery_settings enable row level security;
alter table public.daily_issues enable row level security;
alter table public.theme_posters enable row level security;
alter table public.topic_posters enable row level security;
alter table public.creations enable row level security;
alter table public.delivery_logs enable row level security;
alter table public.news_articles enable row level security;
alter table public.news_fetch_runs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'subscriptions',
    'delivery_settings',
    'daily_issues',
    'theme_posters',
    'topic_posters',
    'creations',
    'delivery_logs'
  ]
  loop
    execute format('drop policy if exists "own rows" on public.%I', table_name);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using (auth.uid()::text = user_id::text) with check (auth.uid()::text = user_id::text)',
      table_name
    );
  end loop;
end
$$;

drop policy if exists "authenticated can read news" on public.news_articles;
create policy "authenticated can read news"
  on public.news_articles for select to authenticated
  using (true);

-- Fetch runs are operational metadata. Only the service role should access
-- them; enabling RLS without a user policy denies browser access.

commit;
