-- XHS v4 (美业)：门店档案 + 草稿扩展字段
-- 目标：支持“先泛后补”、三档冲突、置顶评论、首图提示词、guardrails 追溯

create table if not exists public.store_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_id uuid not null references public.profiles(id) on delete cascade,

  -- 门店昵称/简称（不一定是营业执照名称）
  name text not null default '',

  city text,
  district text,
  landmark text,
  shop_type text,

  -- 引流品/主推（可选）
  main_offer_name text,
  main_offer_duration_min int,
  included_steps jsonb,

  -- 承诺口径：不加价/不缩水/可拒绝（jsonb bool map）
  promises jsonb
);

create index if not exists store_profiles_user_updated_at_idx
  on public.store_profiles (user_id, updated_at desc);

alter table public.store_profiles enable row level security;

-- Re-runnable: if you pasted this SQL before, policies may already exist.
drop policy if exists "store_profiles_select_own" on public.store_profiles;
drop policy if exists "store_profiles_insert_own" on public.store_profiles;
drop policy if exists "store_profiles_update_own" on public.store_profiles;
drop policy if exists "store_profiles_delete_own" on public.store_profiles;
drop policy if exists "store_profiles_service_role_all" on public.store_profiles;

create policy "store_profiles_select_own"
  on public.store_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "store_profiles_insert_own"
  on public.store_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "store_profiles_update_own"
  on public.store_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "store_profiles_delete_own"
  on public.store_profiles
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "store_profiles_service_role_all"
  on public.store_profiles
  for all
  to service_role
  using (true)
  with check (true);

-- 扩展 xhs_drafts（若列已存在则跳过）
alter table public.xhs_drafts
  add column if not exists conflict_level text;

alter table public.xhs_drafts
  add column if not exists pinned_comment text;

alter table public.xhs_drafts
  add column if not exists reply_templates jsonb;

alter table public.xhs_drafts
  add column if not exists cover_text_main text;

alter table public.xhs_drafts
  add column if not exists cover_text_sub text;

alter table public.xhs_drafts
  add column if not exists cover_prompt text;

alter table public.xhs_drafts
  add column if not exists cover_negative text;

alter table public.xhs_drafts
  add column if not exists guardrail_rounds int;

alter table public.xhs_drafts
  add column if not exists guardrail_flags jsonb;

alter table public.xhs_drafts
  add column if not exists store_profile_id uuid references public.store_profiles(id) on delete set null;

alter table public.xhs_drafts
  add column if not exists variant_of uuid references public.xhs_drafts(id) on delete set null;

-- Optional constraint for conflict_level (non-blocking if values are null/other)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'xhs_drafts_conflict_level_check'
  ) then
    alter table public.xhs_drafts
      add constraint xhs_drafts_conflict_level_check
      check (conflict_level is null or conflict_level in ('safe', 'standard', 'hard'));
  end if;
end$$;
