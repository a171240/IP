alter table if exists public.voice_coach_jobs
  alter column stage set default 'main_pending';

update public.voice_coach_jobs
set stage = 'main_pending'
where stage is null
   or stage in ('accepted', 'processing', '');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_coach_jobs_stage_check'
      and conrelid = 'public.voice_coach_jobs'::regclass
  ) then
    alter table public.voice_coach_jobs
      add constraint voice_coach_jobs_stage_check
      check (stage in ('main_pending', 'tts_pending', 'analysis_pending', 'done', 'error'));
  end if;
end $$;
