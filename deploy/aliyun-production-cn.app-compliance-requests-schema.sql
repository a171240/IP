-- Local schema contract for App account compliance request receipts.
-- Scope: schema only. Do not place token values, request headers, URLs, or business rows here.

create table if not exists public.app_compliance_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.mp_companies(id),
  store_id uuid references public.mp_stores(id),
  membership_id uuid references public.mp_account_memberships(id),
  user_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('account_deletion', 'personal_data_deletion')),
  status text not null default 'received' check (status in ('received')),
  reason text,
  confirm_text text,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_compliance_requests_user_requested_idx
  on public.app_compliance_requests (user_id, requested_at desc);

create index if not exists app_compliance_requests_scope_kind_status_requested_idx
  on public.app_compliance_requests (company_id, store_id, kind, status, requested_at desc);
