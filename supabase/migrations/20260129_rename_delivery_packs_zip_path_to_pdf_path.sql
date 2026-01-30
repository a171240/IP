do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'delivery_packs'
      and column_name = 'zip_path'
  ) then
    alter table public.delivery_packs
      add column if not exists pdf_path text;

    update public.delivery_packs
      set pdf_path = coalesce(pdf_path, zip_path)
      where pdf_path is null and zip_path is not null;

    alter table public.delivery_packs
      drop column if exists zip_path;
  end if;
end $$;
