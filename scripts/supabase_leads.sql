create extension if not exists "pgcrypto";

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_day date generated always as ((created_at at time zone 'UTC')::date) stored,
  team_size text not null,
  current_status text not null,
  contact text not null,
  contact_hash text,
  landing_path text not null,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  user_agent text,
  ip_address text,
  ip_hash text,
  source text,
  status text not null default 'new',
  notes text
);

create index if not exists leads_created_at_idx on public.leads (created_at);
create index if not exists leads_contact_idx on public.leads (contact);
create index if not exists leads_utm_campaign_idx on public.leads (utm_campaign);
create unique index if not exists leads_contact_hash_day_key
  on public.leads (contact_hash, created_day);

alter table public.leads enable row level security;

-- Default deny; allow service role for backend APIs.
create policy "service_role_insert_leads"
  on public.leads
  for insert
  to service_role
  with check (true);

create policy "service_role_select_leads"
  on public.leads
  for select
  to service_role
  using (true);

-- Optional: if you must accept anon inserts, enable this policy.
-- create policy "anon_insert_leads"
--   on public.leads
--   for insert
--   to anon
--   with check (true);
