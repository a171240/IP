create table if not exists public.delivery_packs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  status text not null default 'pending',
  input_json jsonb not null,
  output_json jsonb null,
  zip_path text null,
  error_message text null
);

create index if not exists delivery_packs_user_created_at_idx
  on public.delivery_packs (user_id, created_at desc);

alter table public.delivery_packs enable row level security;

create policy "delivery_packs_select_own"
  on public.delivery_packs
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "delivery_packs_insert_own"
  on public.delivery_packs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "delivery_packs_service_role_all"
  on public.delivery_packs
  for all
  to service_role
  using (true)
  with check (true);
