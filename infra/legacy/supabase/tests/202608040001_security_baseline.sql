do $$
declare
  required_table text;
  required_index text;
  required_function text;
begin
  foreach required_table in array array['app_users', 'import_batches', 'products'] loop
    if to_regclass('public.' || required_table) is null then
      raise exception '缺少业务表: %', required_table;
    end if;
  end loop;

  foreach required_index in array array[
    'app_users_active_email_idx',
    'import_batches_created_by_created_at_idx',
    'products_created_by_id_idx',
    'products_batch_id_idx'
  ] loop
    if to_regclass('public.' || required_index) is null then
      raise exception '缺少索引: %', required_index;
    end if;
  end loop;

  foreach required_function in array array['current_app_user_id', 'is_active_member', 'current_app_user_role'] loop
    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = required_function
    ) then
      raise exception '缺少权限函数: %', required_function;
    end if;
  end loop;

  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'products' and rowsecurity) then
    raise exception 'products 未启用 RLS';
  end if;

  if has_table_privilege('authenticated', 'public.products', 'DELETE') then
    raise exception 'authenticated 不应拥有 products DELETE 权限';
  end if;

  if has_column_privilege('authenticated', 'public.products', 'created_by', 'UPDATE') then
    raise exception 'authenticated 不应拥有 products.created_by UPDATE 权限';
  end if;

  if has_column_privilege('authenticated', 'public.products', 'internal_note', 'UPDATE') is false then
    raise exception 'authenticated 应拥有 products.internal_note UPDATE 权限';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'products_update_internal_note'
  ) then
    raise exception '缺少 products 内部备注更新策略';
  end if;
end;
$$;

select
  '请在两个已开通成员的登录会话中手工验证：伪造 created_by 被拒绝、跨成员 batch_id 被拒绝、更新 internal_note 成功、更新受保护字段被拒绝' as manual_check;
