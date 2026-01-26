create table if not exists public.activation_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  user_id uuid null,
  platform text not null default 'xiaohongshu',
  order_tail text not null,
  note text,
  status text not null default 'pending',
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_path text,
  referrer text,
  user_agent text,
  ip_hash text,
  approved_at timestamptz null,
  expires_at timestamptz null
);

create index if not exists activation_requests_status_created_at_idx
  on public.activation_requests (status, created_at);
create index if not exists activation_requests_email_idx on public.activation_requests (email);
create index if not exists activation_requests_ip_hash_idx on public.activation_requests (ip_hash);

alter table public.activation_requests enable row level security;

-- RLS: allow anon/authenticated insert; select only own rows; service role full access.
create policy "activation_requests_insert"
  on public.activation_requests
  for insert
  to anon, authenticated
  with check (true);

create policy "activation_requests_select_own"
  on public.activation_requests
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or lower(email) = lower((auth.jwt() ->> 'email'))
  );

create policy "activation_requests_service_role_all"
  on public.activation_requests
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.entitlements (
  user_id uuid primary key,
  plan text not null default 'free',
  pro_expires_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists entitlements_pro_expires_at_idx on public.entitlements (pro_expires_at);

alter table public.entitlements enable row level security;

-- RLS: users can read their own entitlements; service role manages updates.
create policy "entitlements_select_own"
  on public.entitlements
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "entitlements_service_role_all"
  on public.entitlements
  for all
  to service_role
  using (true)
  with check (true);
