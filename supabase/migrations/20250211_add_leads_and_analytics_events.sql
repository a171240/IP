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
create unique index if not exists leads_contact_hash_day_key
  on public.leads (contact_hash, created_day);

alter table public.leads enable row level security;

-- RLS: default deny; allow service role to insert/select for backend APIs.
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

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null,
  path text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  user_agent text,
  ip_address text,
  props jsonb
);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at);

alter table public.analytics_events enable row level security;

create policy "service_role_insert_analytics_events"
  on public.analytics_events
  for insert
  to service_role
  with check (true);

create policy "service_role_select_analytics_events"
  on public.analytics_events
  for select
  to service_role
  using (true);
