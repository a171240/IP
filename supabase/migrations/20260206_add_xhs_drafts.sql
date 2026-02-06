-- 小红书工坊：草稿/封面/发布历史
-- 目标：让 web 与小程序共用同一套内容资产库（单域名 BFF + Supabase）

create table if not exists public.xhs_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null default 'mp',

  -- 用户输入（可选）
  content_type text,
  topic text,
  keywords text,
  shop_name text,

  -- 生成结果
  result_title text,
  result_content text,
  cover_title text,
  tags jsonb,

  -- 风控检测
  danger_risk_level text,
  danger_count int,

  -- 资产存储（注意：为满足小程序单域名要求，实际访问通过 ip.ipgongchang.xin 的代理接口）
  cover_storage_path text,
  cover_content_type text,
  publish_qr_url text,
  publish_qr_storage_path text,
  publish_qr_content_type text,

  -- 发布结果
  publish_url text,
  published_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published')),

  -- 计费信息（用于后续漏斗/复盘）
  credits_cost int,
  plan_at_generate text
);

create index if not exists xhs_drafts_user_created_at_idx
  on public.xhs_drafts (user_id, created_at desc);

alter table public.xhs_drafts enable row level security;

create policy "xhs_drafts_select_own"
  on public.xhs_drafts
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "xhs_drafts_insert_own"
  on public.xhs_drafts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "xhs_drafts_update_own"
  on public.xhs_drafts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "xhs_drafts_service_role_all"
  on public.xhs_drafts
  for all
  to service_role
  using (true)
  with check (true);
