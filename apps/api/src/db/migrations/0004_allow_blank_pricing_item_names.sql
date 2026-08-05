do $migration$
begin
  if to_regclass('public.pricing_items') is not null then
    alter table pricing_items
      drop constraint if exists pricing_items_product_name_not_blank;
  end if;
end
$migration$;
