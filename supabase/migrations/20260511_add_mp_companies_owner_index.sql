begin;

create index if not exists mp_companies_owner_user_id_idx
  on public.mp_companies(owner_user_id)
  where owner_user_id is not null;

commit;
