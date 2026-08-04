create extension if not exists pgcrypto;

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  email text not null,
  display_name text,
  role text not null default 'operator' check (role in ('owner', 'selector', 'operator')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_email_lowercase check (email = lower(email)),
  constraint app_users_email_not_blank check (btrim(email) <> '')
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.app_users(id) on delete restrict,
  file_name text not null,
  total_rows integer not null check (total_rows >= 0 and total_rows <= 50000),
  success_rows integer not null default 0 check (success_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  status text not null default 'pending' check (status in ('pending', 'importing', 'succeeded', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batches_file_name_not_blank check (btrim(file_name) <> ''),
  constraint import_batches_file_name_length check (char_length(file_name) <= 255),
  constraint import_batches_row_count check (success_rows + failed_rows <= total_rows)
);

create table public.products (
  id bigint generated always as identity primary key,
  seq text,
  sku text,
  platform text,
  name text not null,
  url text,
  spec text,
  price numeric(14, 2),
  internal_note text,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  batch_id uuid not null references public.import_batches(id) on delete restrict,
  constraint products_name_not_blank check (btrim(name) <> '')
);

create index app_users_active_email_idx on public.app_users (is_active, email);
create index import_batches_created_by_created_at_idx on public.import_batches (created_by, created_at desc);
create index products_created_by_id_idx on public.products (created_by, id desc);
create index products_batch_id_idx on public.products (batch_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from public.app_users
  where auth_user_id = auth.uid()
    and is_active
  limit 1;
$$;

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_app_user_id() is not null;
$$;

create or replace function public.current_app_user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role
  from public.app_users
  where auth_user_id = auth.uid()
    and is_active
  limit 1;
$$;

create or replace function public.set_batch_system_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid;
begin
  current_user_id := public.current_app_user_id();
  if current_user_id is null then
    raise exception '当前账号不是已开通的团队成员';
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is not null and new.created_by is distinct from current_user_id then
      raise exception '不能伪造导入批次上传人';
    end if;

    new.id := gen_random_uuid();
    new.created_by := current_user_id;
    new.created_at := now();
    new.updated_at := now();
  elsif new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception '导入批次的系统字段不可修改';
  end if;

  return new;
end;
$$;

create or replace function public.set_product_system_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid;
  batch_owner_id uuid;
begin
  current_user_id := public.current_app_user_id();
  if current_user_id is null then
    raise exception '当前账号不是已开通的团队成员';
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is not null and new.created_by is distinct from current_user_id then
      raise exception '不能伪造商品上传人';
    end if;

    new.created_by := current_user_id;
    new.created_at := now();
    new.updated_at := now();

    select created_by
    into batch_owner_id
    from public.import_batches
    where id = new.batch_id;

    if batch_owner_id is null then
      raise exception '导入批次不存在';
    end if;

    if batch_owner_id is distinct from current_user_id then
      raise exception '不能向其他成员的导入批次写入商品';
    end if;
  elsif new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.batch_id is distinct from old.batch_id
     or new.seq is distinct from old.seq
     or new.sku is distinct from old.sku
     or new.platform is distinct from old.platform
     or new.name is distinct from old.name
     or new.url is distinct from old.url
     or new.spec is distinct from old.spec
     or new.price is distinct from old.price then
    raise exception '商品归属、批次和原始导入字段不可修改';
  end if;

  return new;
end;
$$;

create trigger app_users_touch_updated_at
before update on public.app_users
for each row execute function public.touch_updated_at();

create trigger import_batches_set_system_fields
before insert or update on public.import_batches
for each row execute function public.set_batch_system_fields();

create trigger import_batches_touch_updated_at
before update on public.import_batches
for each row execute function public.touch_updated_at();

create trigger products_set_system_fields
before insert or update on public.products
for each row execute function public.set_product_system_fields();

create trigger products_touch_updated_at
before update on public.products
for each row execute function public.touch_updated_at();

alter table public.app_users enable row level security;
alter table public.import_batches enable row level security;
alter table public.products enable row level security;

revoke all on table public.app_users from anon, authenticated;
revoke all on table public.import_batches from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on function public.touch_updated_at() from public;
revoke all on function public.current_app_user_id() from public;
revoke all on function public.is_active_member() from public;
revoke all on function public.current_app_user_role() from public;
revoke all on function public.set_batch_system_fields() from public;
revoke all on function public.set_product_system_fields() from public;

grant select on table public.app_users to authenticated;
grant select on table public.import_batches to authenticated;
grant insert (file_name, total_rows) on table public.import_batches to authenticated;
grant update (status, success_rows, failed_rows, started_at, finished_at) on table public.import_batches to authenticated;
grant select on table public.products to authenticated;
grant insert (seq, sku, platform, name, url, spec, price, batch_id) on table public.products to authenticated;
grant update (internal_note) on table public.products to authenticated;
grant usage, select on sequence public.products_id_seq to authenticated;
grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.is_active_member() to authenticated;
grant execute on function public.current_app_user_role() to authenticated;

create policy app_users_select_active_members
on public.app_users
for select
to authenticated
using (public.is_active_member() and is_active);

create policy import_batches_select_active_members
on public.import_batches
for select
to authenticated
using (public.is_active_member());

create policy import_batches_insert_active_members
on public.import_batches
for insert
to authenticated
with check (
  public.current_app_user_role() in ('owner', 'selector')
  and created_by = public.current_app_user_id()
);

create policy import_batches_update_owner
on public.import_batches
for update
to authenticated
using (public.is_active_member() and created_by = public.current_app_user_id())
with check (public.is_active_member() and created_by = public.current_app_user_id());

create policy products_select_active_members
on public.products
for select
to authenticated
using (public.is_active_member());

create policy products_insert_active_members
on public.products
for insert
to authenticated
with check (
  public.current_app_user_role() in ('owner', 'selector')
  and created_by = public.current_app_user_id()
);

create policy products_update_internal_note
on public.products
for update
to authenticated
using (public.is_active_member())
with check (public.is_active_member());
