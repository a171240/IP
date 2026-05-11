begin;

create index if not exists mp_account_memberships_store_id_idx
  on public.mp_account_memberships(store_id)
  where store_id is not null;
create index if not exists mp_account_memberships_invited_by_user_id_idx
  on public.mp_account_memberships(invited_by_user_id)
  where invited_by_user_id is not null;
create index if not exists mp_account_invites_invited_by_user_id_idx
  on public.mp_account_invites(invited_by_user_id)
  where invited_by_user_id is not null;

do $$
begin
  create policy "mp_account_invites_no_client_access"
    on public.mp_account_invites
    for all
    to anon, authenticated
    using (false)
    with check (false);
exception
  when duplicate_object then null;
end $$;

comment on policy "mp_account_invites_no_client_access" on public.mp_account_invites is
  'Invitation rows are server-only. Mini-program clients must use API routes, never direct Data API access.';

commit;
