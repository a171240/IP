alter table if exists public.voice_coach_sessions
  add column if not exists category_id text,
  add column if not exists goal_template_id text,
  add column if not exists goal_custom text,
  add column if not exists policy_state_json jsonb;

update public.voice_coach_sessions
set category_id = case
  when scenario_id in ('presale') then 'presale'
  when scenario_id in ('postsale') then 'postsale'
  when scenario_id in ('crisis') then 'crisis'
  else 'sale'
end
where category_id is null or category_id = '';

alter table if exists public.voice_coach_sessions
  alter column category_id set default 'sale';

alter table if exists public.voice_coach_sessions
  alter column category_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_coach_sessions_category_id_check'
      and conrelid = 'public.voice_coach_sessions'::regclass
  ) then
    alter table public.voice_coach_sessions
      add constraint voice_coach_sessions_category_id_check
      check (category_id in ('presale', 'sale', 'postsale', 'crisis'));
  end if;
end $$;

create index if not exists voice_coach_sessions_user_category_idx
  on public.voice_coach_sessions (user_id, category_id, created_at desc);

alter table if exists public.voice_coach_turns
  add column if not exists line_id text,
  add column if not exists intent_id text,
  add column if not exists angle_id text,
  add column if not exists reply_source text;

update public.voice_coach_turns
set reply_source = case
  when role = 'customer' then 'model'
  else null
end
where reply_source is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_coach_turns_reply_source_check'
      and conrelid = 'public.voice_coach_turns'::regclass
  ) then
    alter table public.voice_coach_turns
      add constraint voice_coach_turns_reply_source_check
      check (reply_source is null or reply_source in ('fixed', 'model', 'mixed'));
  end if;
end $$;

create index if not exists voice_coach_turns_session_intent_idx
  on public.voice_coach_turns (session_id, intent_id, angle_id, created_at desc);

create index if not exists voice_coach_turns_line_id_idx
  on public.voice_coach_turns (line_id);
