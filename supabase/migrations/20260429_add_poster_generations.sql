-- Smart poster generation history (mini-program)

create table if not exists public.poster_generations (
  id uuid primary key,
  created_at timestamptz not null default now(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null default 'template' check (mode in ('template', 'free')),
  template_id text,
  image_bucket text not null,
  image_path text not null,
  content_type text,
  size text,
  resolution text
);

create index if not exists poster_generations_user_created_at_idx
  on public.poster_generations (user_id, created_at desc);

alter table public.poster_generations enable row level security;

drop policy if exists "poster_generations_select_own" on public.poster_generations;
drop policy if exists "poster_generations_insert_own" on public.poster_generations;
drop policy if exists "poster_generations_delete_own" on public.poster_generations;
drop policy if exists "poster_generations_service_role_all" on public.poster_generations;

create policy "poster_generations_select_own"
  on public.poster_generations
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "poster_generations_insert_own"
  on public.poster_generations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "poster_generations_delete_own"
  on public.poster_generations
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "poster_generations_service_role_all"
  on public.poster_generations
  for all
  to service_role
  using (true)
  with check (true);
