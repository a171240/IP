-- 私域文案助手：收窄表级权限，行级访问仍由 RLS policy 控制。

revoke all on table public.private_copy_drafts from anon;
revoke all on table public.private_copy_drafts from authenticated;

grant select, insert, update on table public.private_copy_drafts to authenticated;
grant select, insert, update, delete on table public.private_copy_drafts to service_role;
