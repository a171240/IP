create table if not exists public.voice_coach_worker_heartbeats (
  worker_id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  host text null,
  pid int null,
  status text not null default 'alive',
  meta_json jsonb null default '{}'::jsonb
);

create index if not exists voice_coach_worker_heartbeats_heartbeat_at_idx
  on public.voice_coach_worker_heartbeats (heartbeat_at desc);

alter table public.voice_coach_worker_heartbeats enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'voice_coach_worker_heartbeats'
      and policyname = 'voice_coach_worker_heartbeats_service_role_all'
  ) then
    create policy "voice_coach_worker_heartbeats_service_role_all"
      on public.voice_coach_worker_heartbeats
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;
