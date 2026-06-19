-- Opening preparations are generated and consumed by trusted backend routes.
-- Do not expose direct client writes through the Data API.

revoke all on table public.voice_coach_opening_preparations from authenticated;

drop policy if exists "voice_coach_opening_preparations_select_own"
  on public.voice_coach_opening_preparations;

drop policy if exists "voice_coach_opening_preparations_insert_own"
  on public.voice_coach_opening_preparations;

drop policy if exists "voice_coach_opening_preparations_update_own"
  on public.voice_coach_opening_preparations;

grant select, insert, update, delete on public.voice_coach_opening_preparations to service_role;

comment on table public.voice_coach_opening_preparations is
  'Backend-managed precomputed first customer opening text and audio for voice coach startup latency reduction.';
