-- L3 content draft schema hotfix for App-facing poster, xhs, and private-copy draft lists.
-- Scope: schema only. This file must not contain business rows, tokens, or DATABASE_URL_CN.

create table if not exists public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.mp_companies(id) on delete cascade,
  store_id uuid not null references public.mp_stores(id) on delete cascade,
  kind text not null check (kind in ('poster', 'xhs', 'private_copy')),
  title text,
  body text,
  source_context jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'archived')),
  created_by_membership_id uuid references public.mp_account_memberships(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_drafts_scope_kind_status_updated_idx
  on public.content_drafts (company_id, store_id, kind, status, updated_at desc);

create index if not exists content_drafts_created_by_membership_idx
  on public.content_drafts (created_by_membership_id);
