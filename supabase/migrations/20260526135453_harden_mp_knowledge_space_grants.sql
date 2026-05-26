begin;

revoke all on table public.mp_knowledge_spaces from anon;
revoke all on table public.mp_knowledge_spaces from authenticated;
revoke all on table public.mp_knowledge_space_access from anon;
revoke all on table public.mp_knowledge_space_access from authenticated;

grant select on table public.mp_knowledge_spaces to authenticated;
grant select on table public.mp_knowledge_space_access to authenticated;

grant select, insert, update, delete on table public.mp_knowledge_spaces to service_role;
grant select, insert, update, delete on table public.mp_knowledge_space_access to service_role;

commit;
