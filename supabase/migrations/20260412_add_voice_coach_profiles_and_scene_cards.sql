create table if not exists public.voice_coach_customer_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null,
  name text not null,
  age_label text null,
  occupation text null,
  personality_tags jsonb not null default '[]'::jsonb,
  communication_style text null,
  core_concerns jsonb not null default '[]'::jsonb,
  trust_triggers jsonb not null default '[]'::jsonb,
  past_experience text null,
  notes text null
);

create index if not exists voice_coach_customer_profiles_user_updated_idx
  on public.voice_coach_customer_profiles (user_id, updated_at desc);

create table if not exists public.voice_coach_scene_cards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null,
  name text not null,
  scene_kind text not null default 'customer_visit'
    check (scene_kind in ('customer_visit', 'offer_promo')),
  service_name text null,
  customer_stage text null,
  scene_goal text null,
  focus_stages jsonb not null default '[]'::jsonb,
  likely_questions jsonb not null default '[]'::jsonb,
  target_objections jsonb not null default '[]'::jsonb,
  communication_method_tags jsonb not null default '[]'::jsonb,
  must_cover_points jsonb not null default '[]'::jsonb,
  do_not_say jsonb not null default '[]'::jsonb,
  notes text null
);

create index if not exists voice_coach_scene_cards_user_updated_idx
  on public.voice_coach_scene_cards (user_id, updated_at desc);

alter table public.voice_coach_sessions
  add column if not exists customer_profile_id uuid null
    references public.voice_coach_customer_profiles (id) on delete set null,
  add column if not exists scene_card_id uuid null
    references public.voice_coach_scene_cards (id) on delete set null,
  add column if not exists session_context_json jsonb null,
  add column if not exists scenario_snapshot_json jsonb null;

create index if not exists voice_coach_sessions_customer_profile_idx
  on public.voice_coach_sessions (customer_profile_id);

create index if not exists voice_coach_sessions_scene_card_idx
  on public.voice_coach_sessions (scene_card_id);

alter table public.voice_coach_customer_profiles enable row level security;
alter table public.voice_coach_scene_cards enable row level security;

create policy "voice_coach_customer_profiles_select_own"
  on public.voice_coach_customer_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "voice_coach_customer_profiles_insert_own"
  on public.voice_coach_customer_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "voice_coach_customer_profiles_update_own"
  on public.voice_coach_customer_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "voice_coach_customer_profiles_delete_own"
  on public.voice_coach_customer_profiles
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "voice_coach_customer_profiles_service_role_all"
  on public.voice_coach_customer_profiles
  for all
  to service_role
  using (true)
  with check (true);

create policy "voice_coach_scene_cards_select_own"
  on public.voice_coach_scene_cards
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "voice_coach_scene_cards_insert_own"
  on public.voice_coach_scene_cards
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "voice_coach_scene_cards_update_own"
  on public.voice_coach_scene_cards
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "voice_coach_scene_cards_delete_own"
  on public.voice_coach_scene_cards
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "voice_coach_scene_cards_service_role_all"
  on public.voice_coach_scene_cards
  for all
  to service_role
  using (true)
  with check (true);
