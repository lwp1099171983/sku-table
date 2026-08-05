alter table pricing_items
  drop constraint if exists pricing_items_product_name_not_blank;
