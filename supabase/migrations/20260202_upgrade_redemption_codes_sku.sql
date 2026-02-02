alter table public.redemption_codes
  add column if not exists sku text,
  add column if not exists plan_grant text,
  add column if not exists credits_grant integer not null default 0,
  add column if not exists max_uses integer not null default 1,
  add column if not exists used_count integer not null default 0,
  add column if not exists source text;

update public.redemption_codes
set sku = coalesce(sku, 'trial_7d_pro'),
    plan_grant = coalesce(plan_grant, plan, 'trial_pro'),
    credits_grant = coalesce(credits_grant, 0),
    max_uses = coalesce(max_uses, 1),
    used_count = case
      when coalesce(used_count, 0) > 0 then used_count
      when status is null or status = 'unused' then 0
      else 1
    end
where sku is null
   or plan_grant is null
   or credits_grant is null
   or max_uses is null
   or used_count is null;

create index if not exists redemption_codes_sku_idx on public.redemption_codes(sku);
create index if not exists redemption_codes_used_count_idx on public.redemption_codes(used_count);
