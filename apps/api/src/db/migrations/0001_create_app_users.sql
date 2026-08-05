create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  display_name text,
  role text not null default 'operator',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_email_lowercase check (email = lower(email)),
  constraint app_users_email_not_blank check (btrim(email) <> ''),
  constraint app_users_role_check check (role in ('owner', 'selector', 'operator'))
);

create unique index if not exists app_users_email_unique on app_users (email);
create index if not exists app_users_active_email_idx on app_users (is_active, email);
