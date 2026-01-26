-- Backfill legacy activation_requests schema to match v2 fields.

alter table if exists public.activation_requests
  add column if not exists platform text,
  add column if not exists order_tail text,
  add column if not exists note text,
  add column if not exists approved_at timestamptz,
  add column if not exists expires_at timestamptz;

update public.activation_requests
set platform = coalesce(platform, split_part(product_sku, '_', 1))
where platform is null and product_sku is not null;

update public.activation_requests
set order_tail = coalesce(order_tail, order_tail4)
where order_tail is null and order_tail4 is not null;

update public.activation_requests
set order_tail4 = coalesce(order_tail4, order_tail)
where order_tail4 is null and order_tail is not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activation_requests'
      and column_name = 'platform'
  ) then
    execute 'alter table public.activation_requests alter column platform set default ''xiaohongshu''';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activation_requests'
      and column_name = 'product_sku'
  ) then
    execute 'alter table public.activation_requests alter column product_sku drop not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activation_requests'
      and column_name = 'order_tail4'
  ) then
    execute 'alter table public.activation_requests alter column order_tail4 drop not null';
  end if;
end $$;
