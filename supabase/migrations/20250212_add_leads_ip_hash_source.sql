alter table public.leads add column if not exists ip_hash text;
alter table public.leads add column if not exists source text;

create index if not exists leads_utm_campaign_idx
  on public.leads (utm_campaign);
