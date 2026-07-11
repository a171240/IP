-- Local schema contract for APP professional and speech learning progress events.
-- Scope: schema only. Do not place business rows, credentials, or request headers here.

create table if not exists public.app_learning_progress_events (
  id text primary key check (id ~ '^learn_evt_[a-f0-9]{24}$'),
  company_id uuid not null references public.mp_companies(id) on delete cascade,
  store_id uuid not null references public.mp_stores(id) on delete cascade,
  membership_id uuid not null references public.mp_account_memberships(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_event_id text not null check (char_length(client_event_id) between 1 and 220),
  module text not null check (module in ('professional', 'speech')),
  entity_type text not null check (
    entity_type in ('professional_lesson', 'professional_path', 'speech_card', 'speech_group')
  ),
  entity_id text not null check (char_length(entity_id) between 1 and 160),
  action text not null check (action in ('viewed', 'practiced')),
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (company_id, store_id, membership_id, user_id, client_event_id)
);

create index if not exists app_learning_progress_events_scope_module_occurred_idx
  on public.app_learning_progress_events (
    company_id, store_id, membership_id, user_id, module, occurred_at, received_at
  );

create index if not exists app_learning_progress_events_scope_entity_occurred_idx
  on public.app_learning_progress_events (
    company_id, store_id, membership_id, user_id, module, entity_type, entity_id, occurred_at
  );
