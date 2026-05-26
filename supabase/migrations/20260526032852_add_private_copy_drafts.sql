create table if not exists public.private_copy_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_id uuid not null references public.profiles(id) on delete cascade,

  module text not null
    check (module in ('moment_post', 'invitation', 'follow_up', 'moment_reply')),
  scene text,
  channel text,
  status text not null default 'draft'
    check (status in ('generating', 'draft', 'used', 'archived', 'failed')),

  input jsonb not null default '{}'::jsonb,
  input_hash text,
  outputs jsonb not null default '[]'::jsonb,
  usage_tips jsonb not null default '[]'::jsonb,

  preview_text text,
  risk_level text not null default 'low',
  risk_flags jsonb not null default '[]'::jsonb,

  customer_profile_id uuid references public.voice_coach_customer_profiles(id) on delete set null,
  variant_of uuid references public.private_copy_drafts(id) on delete set null,

  selected_output_id text,
  selected_output text,

  credits_cost int,
  plan_at_generate text,
  model_provider text,
  model_name text,
  error_message text,

  copied_at timestamptz,
  used_at timestamptz,
  archived_at timestamptz
);

create index if not exists private_copy_drafts_user_updated_idx
  on public.private_copy_drafts (user_id, updated_at desc);

create index if not exists private_copy_drafts_user_module_idx
  on public.private_copy_drafts (user_id, module, updated_at desc);

create index if not exists private_copy_drafts_user_hash_idx
  on public.private_copy_drafts (user_id, input_hash, created_at desc);

create index if not exists private_copy_drafts_variant_idx
  on public.private_copy_drafts (variant_of);

create index if not exists private_copy_drafts_customer_profile_idx
  on public.private_copy_drafts (customer_profile_id, updated_at desc);

grant select, insert, update on table public.private_copy_drafts to authenticated;
grant select, insert, update, delete on table public.private_copy_drafts to service_role;

alter table public.private_copy_drafts enable row level security;

drop policy if exists "private_copy_drafts_select_own" on public.private_copy_drafts;
drop policy if exists "private_copy_drafts_insert_own" on public.private_copy_drafts;
drop policy if exists "private_copy_drafts_update_own" on public.private_copy_drafts;
drop policy if exists "private_copy_drafts_service_role_all" on public.private_copy_drafts;

create policy "private_copy_drafts_select_own"
  on public.private_copy_drafts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "private_copy_drafts_insert_own"
  on public.private_copy_drafts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "private_copy_drafts_update_own"
  on public.private_copy_drafts
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "private_copy_drafts_service_role_all"
  on public.private_copy_drafts
  for all
  to service_role
  using (true)
  with check (true);
